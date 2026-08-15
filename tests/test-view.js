const fs = require('fs');
const { JSDOM } = require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
const mem = new Map();
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(w) {
    w.storage = {
      async get(k) { return mem.has(k) ? { key: k, value: mem.get(k) } : null; },
      async set(k, v) { mem.set(k, v); return { key: k, value: v }; },
      async list() { return { keys: [] }; }, async delete() { return {}; },
    };
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    w.SVGElement.prototype.setPointerCapture = function () {};
    w.SVGElement.prototype.getTotalLength = () => 100;
    w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
    w.confirm = () => true;
  },
});
const { window } = dom, doc = window.document;
const ev = e => window.eval(e), $ = i => doc.getElementById(i);
const wait = ms => new Promise(r => setTimeout(r, ms));
const errors = []; window.addEventListener('error', e => errors.push(e.message));
let pass = 0, fail = 0;
const ck = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`); };

const S = 34, PAD = 22;
// The element keeps a fixed on-screen size; only the viewBox changes.
const SCREEN = 400;
function pinBoard() {
  const b = $('board');
  b.getBoundingClientRect = () => ({ left: 0, top: 0, width: SCREEN, height: SCREEN });
  Object.defineProperty(b, 'viewBox', {
    get() { const v = b.getAttribute('viewBox').split(' ').map(Number);
      return { baseVal: { x: v[0], y: v[1], width: v[2], height: v[3] } }; },
    configurable: true });
  return b;
}
// where a board coordinate appears on screen, given the current viewBox
function toScreen(bx, by) {
  const v = $('board').getAttribute('viewBox').split(' ').map(Number);
  return { x: (bx - v[0]) / v[2] * SCREEN, y: (by - v[1]) / v[3] * SCREEN };
}
const click = (b, x, y, o = {}) => {
  b.dispatchEvent(new window.PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, button: 0, ...o }));
  b.dispatchEvent(new window.PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true, pointerId: 1, ...o }));
};

(async () => {
  await wait(300);
  $('rowsIn').value = '8'; $('colsIn').value = '8'; $('nameIn').value = 't';
  $('createBtn').click();
  for (let i = 0; i < 300 && !ev('room'); i++) await wait(100);
  if (!ev('room')) { console.log('NO ROOM'); process.exit(1); }
  const board = pinBoard();
  const target = ev('engine.H(3,3)');                  // a segment away from the edges
  const mid = { x: PAD + 3.5 * S, y: PAD + 3 * S };

  console.log('--- unzoomed, clicking hits the segment under the cursor ---');
  let p = toScreen(mid.x, mid.y);
  click(board, p.x, p.y);
  ck('drew on the intended segment', ev(`room.edges[${target}]`), '1');
  click(board, p.x, p.y);
  ck('and cleared it again', ev(`room.edges[${target}]`), '0');

  console.log('\n--- zoomed in, the same spot must still hit it ---');
  ev('zoomAt(view.x+view.w/2, view.y+view.h/2, 2.2)');
  ck('view really did zoom', ev('view.w') < ev('viewFull.w'), true);
  p = toScreen(mid.x, mid.y);
  click(board, p.x, p.y);
  ck('zoomed click hits the same segment', ev(`room.edges[${target}]`), '1');

  console.log('\n--- panned as well ---');
  ev('room.edges = "0".repeat(engine.E)'); ev('render()');
  ev('view.x += view.w*0.3; view.y += view.h*0.2; applyView();');
  p = toScreen(mid.x, mid.y);
  click(board, p.x, p.y);
  ck('panned click hits the same segment', ev(`room.edges[${target}]`), '1');

  console.log('\n--- the view keeps the sheet aspect while clamping ---');
  ev('resetView()');
  const fullAspect = ev('viewFull.w') / ev('viewFull.h');
  ev('zoomAt(0,0,4); view.x=-9999; view.y=-9999; applyView();');
  ck('aspect preserved at the corner', Math.abs(ev('view.w') / ev('view.h') - fullAspect) < 1e-9, true);
  ck('never scrolls past the left edge', ev('view.x') >= 0, true);
  ck('never scrolls past the top', ev('view.y') >= 0, true);
  ev('view.x=99999; view.y=99999; applyView();');
  ck('never scrolls past the right edge', ev('view.x') <= ev('viewFull.w') - ev('view.w') + 1e-9, true);

  console.log('\n--- wheel scrolls, ctrl+wheel zooms ---');
  ev('resetView()');
  ev('zoomAt(view.x+view.w/2,view.y+view.h/2,2)');
  const beforeY = ev('view.y'), beforeW = ev('view.w');
  board.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  ck('wheel scrolled down', ev('view.y') > beforeY, true);
  ck('wheel did not zoom', ev('view.w'), beforeW);
  const beforeX = ev('view.x');
  board.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 120, shiftKey: true, bubbles: true, cancelable: true }));
  ck('shift+wheel scrolled sideways', ev('view.x') > beforeX, true);
  board.dispatchEvent(new window.WheelEvent('wheel', { deltaY: -120, ctrlKey: true, bubbles: true, cancelable: true }));
  ck('ctrl+wheel zoomed in', ev('view.w') < beforeW, true);

  console.log('\n--- diagonals reach the corners ---');
  ev('resetView()');
  ev('queueCell(0,"0")');
  ev('queueDiag(0,"1")'); ev('render()');
  const dg = doc.querySelector('.dg');
  const x1 = +dg.getAttribute('x1'), y1 = +dg.getAttribute('y1');
  const x2 = +dg.getAttribute('x2'), y2 = +dg.getAttribute('y2');
  ck('starts exactly at a dot', [x1, y1], [PAD, PAD]);
  ck('ends exactly at the opposite dot', [x2, y2], [PAD + S, PAD + S]);

  console.log('\n--- joining stays reachable ---');
  ev('openSetup(false)');
  ck('join tab is not hidden', $('tabJoin').hidden, false);
  ck('join explains where the code comes from', /code/i.test($('joinNote').textContent), true);

  console.log('\n' + '='.repeat(50));
  console.log(`${pass} passed, ${fail} failed`);
  if (errors.length) { console.log('ERRORS:'); errors.forEach(e => console.log('  ' + e)); }
  process.exit(fail || errors.length ? 1 : 0);
})();
