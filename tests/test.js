const fs = require('fs');
const path=require('path');
/* the page is index.html in the repository, and slitherlink-plotroom.html when
   working on it loose; accept either */
function pagePath(){
  for(const p of ['index.html','slitherlink-plotroom.html',
                  path.join(__dirname,'..','index.html')])
    if(require('fs').existsSync(p))return p;
  throw new Error('cannot find the page next to these tests');
}

const { JSDOM } = require('jsdom');

const html = fs.readFileSync(pagePath(), 'utf8');

// in-memory stand-in for the artifact storage API
const mem = new Map();
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.storage = {
      async get(k) { return mem.has(k) ? { key: k, value: mem.get(k) } : null; },
      async set(k, v) { mem.set(k, v); return { key: k, value: v }; },
      async list() { return { keys: [...mem.keys()] }; },
      async delete(k) { mem.delete(k); return { key: k, deleted: true }; },
    };
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    w.SVGElement.prototype.setPointerCapture = function () {};
    w.SVGElement.prototype.releasePointerCapture = function () {};
    w.confirm = () => true;
  },
});

const { window } = dom;
const errors = [];
window.addEventListener('error', e => errors.push('window error: ' + e.message));
const origErr = console.error;
console.error = (...a) => { errors.push('console.error: ' + a.join(' ')); };

const wait = ms => new Promise(r => setTimeout(r, ms));

// top-level `let` bindings aren't properties of window, so read them by eval
const ev = expr => window.eval(expr);
const R = () => ev('room');

// The board uses a viewBox; jsdom gives zero-size rects, so drive svgPoint
// by stubbing getBoundingClientRect to a known 1:1 mapping.
function pinBoard() {
  const board = window.document.getElementById('board');
  const vb = board.getAttribute('viewBox').split(' ').map(Number);
  board.getBoundingClientRect = () => ({
    left: 0, top: 0, width: vb[2], height: vb[3], right: vb[2], bottom: vb[3],
  });
  Object.defineProperty(board, 'viewBox', {
    value: { baseVal: { x: 0, y: 0, width: vb[2], height: vb[3] } },
    configurable: true,
  });
  return board;
}

function click(board, x, y, opts = {}) {
  const base = { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, button: 0 };
  const down = new window.PointerEvent('pointerdown', { ...base, ...opts });
  board.dispatchEvent(down);
  board.dispatchEvent(new window.PointerEvent('pointerup', { ...base, ...opts }));
}

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

(async () => {
  await wait(300);

  // create a small sheet
  window.document.getElementById('nameIn').value = 'tester';
  window.document.getElementById('createBtn').click();
  for (let i = 0; i < 150 && !R(); i++) await wait(100);
  if (!R()) { console.log('ROOM NEVER CREATED'); console.log('err:', window.document.getElementById('err').textContent); errors.forEach(e=>console.log(e)); process.exit(1); }
  console.log(`sheet ${R().code} ${R().R}x${R().C}\n`);

  const board = pinBoard();
  const S = 34, PAD = 22;
  // midpoint of the top horizontal segment of cell (0,0)
  const hx = PAD + 0.5 * S, hy = PAD;
  const edgeIdx = ev('engine.H(0,0)');
  const cellIdx = 0;
  const cx = PAD + 0.5 * S, cy = PAD + 0.5 * S; // centre of cell (0,0)

  console.log('--- segments: click twice removes ---');
  click(board, hx, hy);
  check('click once  -> line', ev('room.edges['+edgeIdx+']'), '1');
  click(board, hx, hy);
  check('click twice -> blank', ev('room.edges['+edgeIdx+']'), '0');

  console.log('\n--- shift-click makes x, twice removes ---');
  click(board, hx, hy, { shiftKey: true });
  check('shift once  -> x', ev('room.edges['+edgeIdx+']'), '2');
  click(board, hx, hy, { shiftKey: true });
  check('shift twice -> blank', ev('room.edges['+edgeIdx+']'), '0');

  console.log('\n--- crossing between mark types ---');
  click(board, hx, hy);                       // line
  click(board, hx, hy, { shiftKey: true });   // x replaces line
  check('line then shift -> x', ev('room.edges['+edgeIdx+']'), '2');
  click(board, hx, hy);                       // plain replaces x with line
  check('x then plain    -> line', ev('room.edges['+edgeIdx+']'), '1');
  click(board, hx, hy);
  check('line then plain -> blank', ev('room.edges['+edgeIdx+']'), '0');

  console.log('\n--- right-click also makes x ---');
  click(board, hx, hy, { button: 2 });
  check('right once  -> x', ev('room.edges['+edgeIdx+']'), '2');
  click(board, hx, hy, { button: 2 });
  check('right twice -> blank', ev('room.edges['+edgeIdx+']'), '0');

  console.log('\n--- ctrl = blue square, alt = yellow square ---');
  click(board, cx, cy, { ctrlKey: true });
  check('ctrl once  -> blue', ev('room.cells['+cellIdx+']'), '1');
  click(board, cx, cy, { ctrlKey: true });
  check('ctrl twice -> empty', ev('room.cells['+cellIdx+']'), '0');
  click(board, cx, cy, { altKey: true });
  check('alt once   -> yellow', ev('room.cells['+cellIdx+']'), '2');
  click(board, cx, cy, { altKey: true });
  check('alt twice  -> empty', ev('room.cells['+cellIdx+']'), '0');

  console.log('\n--- swapping colours, and macOS ctrl-as-right-click ---');
  click(board, cx, cy, { ctrlKey: true });
  click(board, cx, cy, { altKey: true });
  check('blue then alt -> yellow', ev('room.cells['+cellIdx+']'), '2');
  click(board, cx, cy, { ctrlKey: true });
  check('yellow then ctrl -> blue', ev('room.cells['+cellIdx+']'), '1');
  click(board, cx, cy, { ctrlKey: true, button: 2 });  // mac reports button 2
  check('ctrl+button2 -> clears (not an x)', ev('room.cells['+cellIdx+']'), '0');
  check('...and left the segment alone', ev('room.edges['+edgeIdx+']'), '0');

  console.log('\n--- colour fill renders on the svg ---');
  click(board, cx, cy, { ctrlKey: true });
  const f = window.document.querySelectorAll('.fillsq')[cellIdx];
  check('fill visible', f.classList.contains('on'), true);
  check('fill colour', f.getAttribute('fill'), 'var(--mark-blue)');

  console.log('\n--- undo covers both kinds of mark ---');
  const undo = window.document.getElementById('undo');
  undo.click();
  check('undo clears the blue square', ev('room.cells['+cellIdx+']'), '0');
  click(board, hx, hy);
  check('drew a line', ev('room.edges['+edgeIdx+']'), '1');
  undo.click();
  check('undo clears the line', ev('room.edges['+edgeIdx+']'), '0');
  window.document.getElementById('redo').click();
  check('redo restores the line', ev('room.edges['+edgeIdx+']'), '1');
  undo.click();

  console.log('\n--- drag paints ---');
  const down = new window.PointerEvent('pointerdown', {
    clientX: hx, clientY: hy, bubbles: true, cancelable: true, pointerId: 1, button: 0 });
  board.dispatchEvent(down);
  board.dispatchEvent(new window.PointerEvent('pointermove', {
    clientX: PAD + 1.5 * S, clientY: PAD, bubbles: true, pointerId: 1 }));
  board.dispatchEvent(new window.PointerEvent('pointerup', {
    clientX: PAD + 1.5 * S, clientY: PAD, bubbles: true, pointerId: 1 }));
  check('drag drew first segment', ev('room.edges[engine.H(0,0)]'), '1');
  check('drag drew second segment', ev('room.edges[engine.H(0,1)]'), '1');
  undo.click();
  check('undo reverts whole drag (1st)', ev('room.edges[engine.H(0,0)]'), '0');
  check('undo reverts whole drag (2nd)', ev('room.edges[engine.H(0,1)]'), '0');

  console.log('\n--- ctrl-drag paints squares ---');
  board.dispatchEvent(new window.PointerEvent('pointerdown', {
    clientX: cx, clientY: cy, bubbles: true, cancelable: true, pointerId: 1, button: 0, ctrlKey: true }));
  board.dispatchEvent(new window.PointerEvent('pointermove', {
    clientX: PAD + 1.5 * S, clientY: cy, bubbles: true, pointerId: 1, ctrlKey: true }));
  board.dispatchEvent(new window.PointerEvent('pointerup', {
    clientX: PAD + 1.5 * S, clientY: cy, bubbles: true, pointerId: 1, ctrlKey: true }));
  check('ctrl-drag painted cell 0', ev('room.cells[0]'), '1');
  check('ctrl-drag painted cell 1', ev('room.cells[1]'), '1');

  console.log('\n--- clear colors button ---');
  window.document.getElementById('clearfill').click();
  check('all squares cleared', /^0+$/.test(ev('room.cells')), true);

  console.log('\n--- colours survive a save/load round trip ---');
  click(board, cx, cy, { altKey: true });
  await wait(700);                         // let it flush to storage
  const saved = JSON.parse(mem.get('sl:room:' + R().code));
  check('yellow square written to storage', saved.cells[0], '2');
  check('cell timestamps written', Array.isArray(saved.ct), true);

  console.log('\n--- an old sheet with no cell data still loads ---');
  delete saved.cells; delete saved.ct;
  saved.now = Date.now();
  ev('adopt')(saved);
  check('cells backfilled', ev('room.cells.length'), ev('engine.NC'));
  // same generation: a legacy sheet has no cell data, so local marks must survive
  check('local yellow survives legacy merge', ev('room.cells[0]'), '2');
  click(board, cx, cy, { ctrlKey: true });
  check('can still paint after backfill', ev('room.cells[0]'), '1');

  console.log('\n--- joining a brand new legacy sheet ---');
  const legacy = JSON.parse(JSON.stringify(saved));
  delete legacy.cells; delete legacy.ct;
  legacy.gen = Date.now() + 5000;   // newer sheet => full replace
  legacy.now = Date.now();
  ev('adopt')(legacy);
  check('legacy sheet adopted clean', /^0+$/.test(ev('room.cells')), true);
  const board2 = pinBoard();
  click(board2, cx, cy, { altKey: true });
  check('paints on the legacy sheet', ev('room.cells[0]'), '2');
  check('renders on the legacy sheet',
    window.document.querySelectorAll('.fillsq')[0].getAttribute('fill'), 'var(--mark-yellow)');

  console.log('\n' + '='.repeat(46));
  console.log(`${pass} passed, ${fail} failed`);
  if (errors.length) { console.log('\nRUNTIME ERRORS:'); errors.forEach(e => console.log('  ' + e)); }
  else console.log('no runtime errors');
  process.exit(fail || errors.length ? 1 : 0);
})();
