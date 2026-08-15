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
const mem = new Map();
let downloaded = null;
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(w) {
    w.storage = {
      async get(k) { return mem.has(k) ? { key: k, value: mem.get(k) } : null; },
      async set(k, v) { mem.set(k, v); return { key: k, value: v }; },
      async list() { return { keys: [...mem.keys()] }; }, async delete() { return {}; },
    };
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    w.SVGElement.prototype.setPointerCapture = function () {};
    w.SVGElement.prototype.getTotalLength = () => 100;
    w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
    w.URL.createObjectURL = (blob) => { downloaded = blob; return 'blob:x'; };
    w.URL.revokeObjectURL = () => {};
    w.confirm = () => true;
  },
});
const { window } = dom;
const doc = window.document;
const ev = e => window.eval(e);
const $ = i => doc.getElementById(i);
const wait = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
window.addEventListener('error', e => errors.push(e.message));

let pass = 0, fail = 0;
const ck = (n, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);
};

const S = 34, PAD = 22;
function pinBoard() {
  const b = $('board');
  b.getBoundingClientRect = () => {
    const vb = b.getAttribute('viewBox').split(' ').map(Number);
    return { left: 0, top: 0, width: vb[2], height: vb[3] };
  };
  Object.defineProperty(b, 'viewBox', {
    get() {
      const vb = b.getAttribute('viewBox').split(' ').map(Number);
      return { baseVal: { x: vb[0], y: vb[1], width: vb[2], height: vb[3] } };
    }, configurable: true,
  });
  return b;
}
const down = (b, x, y, o = {}) => b.dispatchEvent(new window.PointerEvent('pointerdown',
  { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, button: 0, ...o }));
const move = (b, x, y, o = {}) => b.dispatchEvent(new window.PointerEvent('pointermove',
  { clientX: x, clientY: y, bubbles: true, pointerId: 1, ...o }));
const up = (b, x, y, o = {}) => b.dispatchEvent(new window.PointerEvent('pointerup',
  { clientX: x, clientY: y, bubbles: true, pointerId: 1, ...o }));
const key = (t, k, code) => window.dispatchEvent(new window.KeyboardEvent(t, { key: k, code, bubbles: true }));

(async () => {
  await wait(300);
  $('rowsIn').value = '6'; $('colsIn').value = '6'; $('nameIn').value = 't';
  $('createBtn').click();
  for (let i = 0; i < 300 && !ev('room'); i++) await wait(100);
  if (!ev('room')) { console.log('NO ROOM'); errors.forEach(e => console.log(e)); process.exit(1); }
  const board = pinBoard();
  const C = ev('engine.C');

  console.log('--- the removed things are gone ---');
  ck('no auto-cross toggle', $('optAutoX'), null);
  ck('no node cursor on the board', doc.querySelectorAll('.cursor').length, 0);
  ck('no live sheet list', $('roomlist'), null);

  console.log('\n--- outside the grid is blue ---');
  ck('outside layer exists', doc.querySelectorAll('.outside').length, 1);
  ck('inside is paper', doc.querySelectorAll('.inside').length, 1);

  console.log('\n--- a sweep marks every segment it crosses ---');
  // drag straight down the left column, three edges' worth, in one jump
  down(board, PAD, PAD, { shiftKey: true });
  move(board, PAD, PAD + 3 * S, { shiftKey: true });
  up(board, PAD, PAD + 3 * S, { shiftKey: true });
  const xs = [ev('engine.V(0,0)'), ev('engine.V(1,0)'), ev('engine.V(2,0)')].map(i => ev(`room.edges[${i}]`));
  ck('all three crossed segments marked', xs, ['2', '2', '2']);

  console.log('\n--- a curved sweep no longer throws the stroke away ---');
  ev('[...Array(engine.E).keys()].forEach(i=>queueOp(i,"0"))'); ev('render()');
  down(board, PAD, PAD, { shiftKey: true });
  move(board, PAD + 3, PAD + S, { shiftKey: true });      // drifts sideways
  move(board, PAD - 2, PAD + 2 * S, { shiftKey: true });
  up(board, PAD, PAD + 2 * S, { shiftKey: true });
  const curved = [ev('engine.V(0,0)'), ev('engine.V(1,0)')].map(i => ev(`room.edges[${i}]`));
  ck('curved sweep still marks', curved, ['2', '2']);

  console.log('\n--- hold D for diagonals ---');
  key('keydown', 'd', 'KeyD');
  // corner to corner across cell (0,0)
  down(board, PAD, PAD);
  move(board, PAD + S, PAD + S);
  up(board, PAD + S, PAD + S);
  ck('a corner-to-corner drag draws one', ev('room.diag[0]'), '1');
  ck('drawn on the board', doc.querySelectorAll('.dg').length >= 1, true);
  // the other diagonal of cell (0,1)
  down(board, PAD + 2 * S, PAD);
  move(board, PAD + S, PAD + S);
  up(board, PAD + S, PAD + S);
  ck('reverse drag slants the other way', ev('room.diag[1]'), '2');
  // the same drag again removes it
  down(board, PAD, PAD);
  move(board, PAD + S, PAD + S);
  up(board, PAD + S, PAD + S);
  ck('drawing it again clears it', ev('room.diag[0]'), '0');
  key('keyup', 'd', 'KeyD');
  down(board, PAD + 4.5 * S, PAD + 4.5 * S);
  up(board, PAD + 4.5 * S, PAD + 4.5 * S);
  ck('D released, no diagonal', ev(`room.diag[${4 * C + 4}]`), '0');
  ck('diagonals do not affect the loop', ev('loopStatus().solved'), false);

  console.log('\n--- zoom and pan ---');
  const full = ev('viewFull.w');
  ck('starts fitted', ev('view.w'), full);
  $('zoomIn').click();
  ck('zoom in narrows the view', ev('view.w') < full, true);
  ck('reset button appears', $('zoomReset').hidden, false);
  ck('view stays inside the sheet', ev('view.x') >= 0 && ev('view.y') >= 0, true);
  $('zoomReset').click();
  ck('fit restores', ev('view.w'), full);
  for (let i = 0; i < 30; i++) $('zoomOut').click();
  ck('cannot zoom out past the sheet', ev('view.w'), full);

  console.log('\n--- branch inheritance: marks flow downward ---');
  ev('[...Array(engine.E).keys()].forEach(i=>queueOp(i,"0"))'); ev('render()');
  $('trialStart').click();
  const b1 = ev('trial.id');
  ev(`queueOp(${ev('engine.H(0,0)')},"1")`); ev('render()');   // premise
  $('trialStart').click();
  const b2 = ev('trial.id');
  ev(`switchBranch(${JSON.stringify(b1)})`);
  const shared = ev('engine.H(3,3)');
  ev(`setEdgeUser(${shared},"2",false)`);                  // added on the parent
  ck('parent has it', ev(`room.edges[${shared}]`), '2');
  ev(`switchBranch(${JSON.stringify(b2)})`);
  ck('child inherited it', ev(`room.edges[${shared}]`), '2');
  // a child that already decided differently keeps its own answer
  const own = ev('engine.H(4,4)');
  ev(`setEdgeUser(${own},"1",false)`);
  ev(`switchBranch(${JSON.stringify(b1)})`);
  ev(`setEdgeUser(${own},"2",false)`);
  ev(`switchBranch(${JSON.stringify(b2)})`);
  ck('child keeps its own decision', ev(`room.edges[${own}]`), '1');
  ev('switchBranch(null)'); ev('clearBranches()');

  console.log('\n--- completion screen ---');
  ck('hidden while unsolved', $('done').hidden, true);
  ev(`(()=>{const s=solutionFor();for(let i=0;i<engine.E;i++)queueOp(i,s[i]===ON?"1":"0");})()`);
  ev('render()');
  ck('shows when the sheet is solved', $('done').hidden, false);
  ck('says which it was', $('doneWhere').textContent, 'SHEET COMPLETE');
  ck('reports the grid', /6×6/.test($('doneStats').textContent), true);
  ck('no promote button for the sheet', $('donePromote').hidden, true);
  $('doneStay').click();
  ck('dismissable', $('done').hidden, true);

  console.log('\n--- export carries the puzzle and the progress ---');
  $('exportBtn').click();
  await wait(100);
  ck('a file was produced', !!downloaded, true);
  const text = await downloaded.text();
  const save = JSON.parse(text);
  ck('is a readable pack', save.format, 'slitherlink-pack');
  ck('clues included', save.puzzles[0].clues.length, 36);
  ck('progress included', typeof save.puzzles[0].progress.edges, 'string');
  ck('progress matches the board', save.puzzles[0].progress.edges, ev('room.edges'));

  console.log('\n--- and re-importing restores that progress ---');
  const solvedEdges = ev('room.edges');
  ev('clearBranches()');
  const input = $('packIn');
  input.onchange({ target: { files: [{ name: 'p.json', text: async () => text }], value: '' } });
  await wait(600);
  ck('board came back mid-solve', ev('room.edges'), solvedEdges);

  console.log('\n--- slink-gen download ---');
  downloaded = null;
  $('getGen').click();
  await wait(80);
  ck('generator offered', !!downloaded, true);
  const gen = await downloaded.text();
  ck('is the real script', gen.startsWith('#!/usr/bin/env node'), true);
  ck('carries the solver fix', gen.includes('function rec(cy0)'), true);

  console.log('\n' + '='.repeat(50));
  console.log(`${pass} passed, ${fail} failed`);
  if (errors.length) { console.log('ERRORS:'); errors.forEach(e => console.log('  ' + e)); }
  process.exit(fail || errors.length ? 1 : 0);
})();
