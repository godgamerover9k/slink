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
const seg = (x, y, dir, len) => `M${x} ${y}${dir}${len}`;

(async () => {
  await wait(300);
  $('rowsIn').value = '4'; $('colsIn').value = '4'; $('nameIn').value = 't';
  $('createBtn').click();
  for (let i = 0; i < 200 && !ev('room'); i++) await wait(100);
  if (!ev('room')) { console.log('NO ROOM'); process.exit(1); }
  const C = ev('engine.C');

  console.log('--- geometry: fills are full-bleed and overlap ---');
  ev('queueCell(0,"1")'); ev('queueCell(1,"1")'); ev('render()');
  const rects = doc.querySelectorAll('.fillsq');
  const x0 = +rects[0].getAttribute('x'), w0 = +rects[0].getAttribute('width');
  const x1 = +rects[1].getAttribute('x');
  console.log(`      cell0 x=${x0} w=${w0} right=${x0 + w0} | cell1 x=${x1}`);
  ck('adjacent rects overlap, leaving no seam', x0 + w0 > x1, true);
  ck('fill covers the full cell', w0 >= S, true);
  ck('no rounded corners', rects[0].getAttribute('rx'), null);
  ck('no per-cell stroke', rects[0].getAttribute('stroke'), null);

  console.log('\n--- no outline is drawn around colour ---');
  ck('no outline element exists', doc.querySelectorAll('.filledge').length, 0);
  ck('no stroke on the fill itself', rects[0].getAttribute('stroke'), null);

  console.log('\n--- different colours still read apart ---');
  ev('queueCell(1,"2")'); ev('render()');
  ck('cell0 stays blue', rects[0].getAttribute('fill'), 'var(--mark-blue)');
  ck('cell1 is yellow', rects[1].getAttribute('fill'), 'var(--mark-yellow)');

  console.log('\n--- a 2x2 block is one continuous colour ---');
  ['0', '1', String(C), String(C + 1)].forEach(k => ev(`queueCell(${k},"1")`));
  ev('render()');
  ck('all four filled', [0, 1, C, C + 1].every(k => doc.querySelectorAll('.fillsq')[k].classList.contains('on')), true);
  ck('still no dividers', doc.querySelectorAll('.filledge').length, 0);

  console.log('\n--- trial marks stay distinguishable ---');
  ev('[0,1,' + C + ',' + (C + 1) + '].forEach(k=>queueCell(k,"0"))'); ev('render()');
  $('trialStart').click();
  ev('queueCell(0,"1")'); ev('render()');
  ck('a branch fill is the ordinary colour, not a special tone',
    rects[0].getAttribute('fill'), 'var(--mark-blue)');
  ck('trial fill is still drawn', rects[0].classList.contains('on'), true);
  $('trialReject').click();   // rule the premise out; the opposite lands on the sheet
  ck('deduced fill is the solid colour', rects[0].getAttribute('fill'), 'var(--mark-yellow)');
  ck('no outline appears after the deduction', doc.querySelectorAll('.filledge').length, 0);

  console.log('\n--- clearing removes the outline ---');
  $('clearfill').click();
  ck('fill hidden', rects[0].classList.contains('on'), false);

  console.log('\n' + '='.repeat(48));
  console.log(`${pass} passed, ${fail} failed`);
  if (errors.length) { console.log('ERRORS:'); errors.forEach(e => console.log('  ' + e)); }
  process.exit(fail || errors.length ? 1 : 0);
})();
