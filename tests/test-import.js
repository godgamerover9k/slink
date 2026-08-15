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
      async list() { return { keys: [...mem.keys()] }; }, async delete() { return {}; },
    };
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    w.SVGElement.prototype.setPointerCapture = function () {};
    // jsdom has no SVG geometry/animation; the solve flourish needs both
    w.SVGElement.prototype.getTotalLength = () => 100;
    w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
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

// hand the page a File without a real file picker
const feed = text => {
  const input = $('packIn');
  const file = { name: 'pack.json', text: async () => text };
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.onchange({ target: { files: [file], value: '' } });
};
const rowsShown = () => [...doc.querySelectorAll('.pk')].map(b => b.children[0].textContent);

(async () => {
  await wait(300);
  $('nameIn').value = 'importer';

  const packText = fs.readFileSync(process.argv[2] || '/tmp/p1.json', 'utf8');
  const pack = JSON.parse(packText);
  console.log(`--- pack from disk: ${pack.puzzles.length} puzzles, ${pack.generator} ---`);

  ck('list hidden before import', $('packList').hidden, true);
  feed(packText);
  await wait(200);
  ck('every puzzle is listed', rowsShown().length, pack.puzzles.length);
  ck('row shows size and clue count', rowsShown()[0],
    `${pack.puzzles[0].R}×${pack.puzzles[0].C} · ${pack.puzzles[0].given} clues`);
  ck('no error reported', $('err').textContent, '');

  console.log('\n--- opening the second puzzle ---');
  doc.querySelectorAll('.pk')[1].click();
  for (let i = 0; i < 200 && !ev('room'); i++) await wait(50);
  ck('a sheet opened', !!ev('room'), true);
  const want = pack.puzzles[1];
  ck('rows match the pack', ev('room.R'), want.R);
  ck('cols match the pack', ev('room.C'), want.C);
  ck('clues match the pack exactly', ev('JSON.stringify(room.clues)'), JSON.stringify(want.clues));
  ck('clue count carried over', ev('room.given'), want.given);
  ck('setup card closed', $('veil').hidden, true);
  ck('board built to the right size', doc.querySelectorAll('.clue').length, want.R * want.C);

  console.log('\n--- the imported puzzle is actually playable ---');
  const sol = ev('solutionFor()');
  ck('the site can solve it', !!sol, true);
  let on = 0;
  for (let i = 0; i < ev('engine.E'); i++) if (sol[i] === ev('ON')) on++;
  ck('its solution has a loop in it', on > 0, true);
  // play the whole solution and confirm the sheet registers as solved
  ev(`(()=>{const s=solutionFor();for(let i=0;i<engine.E;i++)if(s[i]===ON)queueOp(i,"1");})()`);
  ev('render()');
  ck('playing the solution solves the sheet', !!ev('room.solvedAt'), true);

  console.log('\n--- it syncs like any other sheet ---');
  await wait(800);
  const stored = JSON.parse(mem.get('sl:room:' + ev('room.code')));
  ck('imported sheet reached storage', stored.clues.length, want.R * want.C);

  console.log('\n--- malformed packs are refused, not opened ---');
  const bad = [
    ['not json at all', 'nonsense{', /valid JSON/],
    ['wrong format tag', JSON.stringify({ format: 'sudoku-pack', puzzles: [] }), /not a Slitherlink pack/],
    ['no puzzles', JSON.stringify({ format: 'slitherlink-pack', puzzles: [] }), /no puzzles/],
    ['clue count mismatch', JSON.stringify({ puzzles: [{ R: 4, C: 4, clues: [1, 2, 3] }] }), /lists 3 clues/],
    ['clue out of range', JSON.stringify({ puzzles: [{ R: 2, C: 2, clues: [9, 1, 1, 1] }] }), /outside 0/],
    ['grid too small', JSON.stringify({ puzzles: [{ R: 1, C: 1, clues: [1] }] }), /smaller than/],
  ];
  for (const [name, text, re] of bad) {
    $('err').textContent = '';
    feed(text);
    await wait(120);
    ck(`refused: ${name}`, re.test($('err').textContent), true);
    ck(`  ...and listed nothing`, $('packList').hidden, true);
  }

  console.log('\n--- a well-formed but unsolvable puzzle is caught ---');
  const impossible = { format: 'slitherlink-pack', puzzles: [{ R: 3, C: 3, clues: [0, 0, 0, 0, 4, 0, 0, 0, 0] }] };
  feed(JSON.stringify(impossible));
  await wait(400);
  ck('refused on the solver check', /no solution|more than one/.test($('err').textContent), true);

  console.log('\n--- a bare single puzzle (not a pack) also works ---');
  const single = JSON.stringify(pack.puzzles[0]);
  feed(single);
  for (let i = 0; i < 200; i++) { await wait(50); if (ev('room.C') === pack.puzzles[0].C && ev('JSON.stringify(room.clues)') === JSON.stringify(pack.puzzles[0].clues)) break; }
  ck('opened straight away', ev('JSON.stringify(room.clues)'), JSON.stringify(pack.puzzles[0].clues));

  console.log('\n' + '='.repeat(50));
  console.log(`${pass} passed, ${fail} failed`);
  if (errors.length) { console.log('ERRORS:'); errors.forEach(e => console.log('  ' + e)); }
  process.exit(fail || errors.length ? 1 : 0);
})();
