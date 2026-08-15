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

(async () => {
  await wait(300);

  console.log('--- hidden until generation starts ---');
  ck('progress hidden at rest', $('gen').hidden, true);

  // record every distinct frame the user would see
  const frames = [];
  const snap = () => {
    const f = {
      stage: $('genStage').textContent,
      pct: $('genPct').textContent,
      note: $('genNote').textContent,
      width: $('genFill').style.width,
      wait: $('gen').classList.contains('gen--wait'),
      hidden: $('gen').hidden,
    };
    const last = frames[frames.length - 1];
    if (!last || JSON.stringify(last) !== JSON.stringify(f)) frames.push(f);
  };
  const watch = setInterval(snap, 25);

  $('rowsIn').value = '7'; $('colsIn').value = '7'; $('nameIn').value = 't';
  // maximal exercises multi-pass trimming
  [...doc.querySelectorAll('#diffChips .chip')].find(b => b.textContent === 'Maximal').click();
  $('createBtn').click();
  await wait(60);
  ck('shown once generating', $('gen').hidden, false);
  ck('button says it is working', $('createBtn').textContent, 'Plotting a puzzle…');

  for (let i = 0; i < 400 && !ev('room'); i++) await wait(100);
  clearInterval(watch);
  snap();
  if (!ev('room')) { console.log('NO ROOM'); process.exit(1); }

  console.log(`\n--- ${frames.length} distinct frames observed ---`);
  const loopFrames = frames.filter(f => f.stage === 'Laying out a loop');
  const trimFrames = frames.filter(f => f.stage.startsWith('Trimming'));
  console.log('  loop-laying frames:', loopFrames.length);
  console.log('  trimming frames   :', trimFrames.length);
  console.log('  first :', JSON.stringify(frames[0]));
  console.log('  a trim:', JSON.stringify(trimFrames[Math.floor(trimFrames.length / 2)] || {}));
  console.log('  last  :', JSON.stringify(frames[frames.length - 1]));

  ck('reports the loop-laying phase', loopFrames.length > 0, true);
  ck('loop phase uses the indeterminate bar', loopFrames.every(f => f.wait), true);
  ck('loop phase shows elapsed time', /^\d+[sm]/.test(loopFrames[loopFrames.length - 1].pct), true);
  ck('reports the trimming phase', trimFrames.length > 1, true);
  ck('trim phase is determinate', trimFrames.every(f => !f.wait), true);
  ck('trim shows a percentage', /^\d+%$/.test(trimFrames[0].pct), true);
  ck('bar width tracks the percentage',
    trimFrames.every(f => Math.abs(parseFloat(f.width) - parseInt(f.pct)) <= 1.5), true);

  const pcts = trimFrames.map(f => parseInt(f.pct));
  ck('percentage advances', Math.max(...pcts) > Math.min(...pcts), true);
  ck('percentage never exceeds 100', Math.max(...pcts) <= 100, true);

  const counts = trimFrames.map(f => +(f.note.match(/(\d+) clues left/) || [0, NaN])[1]);
  ck('clue count reported', counts.every(n => Number.isFinite(n)), true);
  ck('clue count only falls',
    counts.every((n, i) => i === 0 || n <= counts[i - 1] || trimFrames[i].stage !== trimFrames[i - 1].stage), true);

  const passes = [...new Set(trimFrames.map(f => f.stage))];
  console.log('  stages seen:', JSON.stringify(passes));
  // a second pass now only happens when a check ran out of budget, so it is
  // legitimately absent on easy boards; only the labelling is asserted
  ck('any later pass is labelled',
    passes.every(x => x === 'Trimming clues' || /^Trimming clues · pass \d+$/.test(x)), true);

  ck('hidden again when finished', $('gen').hidden, true);
  ck('button restored', $('createBtn').textContent, 'Generate the puzzle');
  ck('button usable again', $('createBtn').disabled, false);
  console.log(`  built ${ev('room.R')}x${ev('room.C')}, ${ev('room.given')} clues`);

  console.log('\n--- failure path hides the progress too ---');
  ev('openSetup(false)');
  $('rowsIn').value = '1'; $('rowsIn').dispatchEvent(new window.Event('input', { bubbles: true }));
  ev('document.getElementById("createBtn").disabled=false');
  $('createBtn').click();
  await wait(120);
  ck('progress not left on screen', $('gen').hidden, true);
  ck('error explains the problem', /between/.test($('err').textContent), true);

  console.log('\n' + '='.repeat(50));
  console.log(`${pass} passed, ${fail} failed`);
  if (errors.length) { console.log('ERRORS:'); errors.forEach(e => console.log('  ' + e)); }
  process.exit(fail || errors.length ? 1 : 0);
})();
