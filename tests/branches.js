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
console.error = (...a) => errors.push('console.error: ' + a.join(' '));

let pass = 0, fail = 0;
const ck = (n, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);
};
const rows = () => [...doc.querySelectorAll('.tw')].map(r => r.querySelector('.tw__label').textContent);
const activeRow = () => {
  const r = [...doc.querySelectorAll('.tw')].find(x => x.getAttribute('aria-current') === 'true');
  return r ? r.querySelector('.tw__label').textContent : null;
};

(async () => {
  await wait(300);
  $('rowsIn').value = '5'; $('colsIn').value = '5'; $('nameIn').value = 't';
  $('createBtn').click();
  for (let i = 0; i < 200 && !ev('room'); i++) await wait(100);
  if (!ev('room')) { console.log('NO ROOM'); errors.forEach(e => console.log(e)); process.exit(1); }
  const C = ev('engine.C');
  const E0 = ev('engine.H(0,0)'), E1 = ev('engine.V(0,0)'), E2 = ev('engine.H(2,2)');
  await wait(600);

  console.log('--- the tree starts as just the sheet ---');
  ck('one row: the sheet', rows(), ['Master']);
  ck('sheet is active', activeRow(), 'Master');
  ck('no keep button exists', $('trialKeep'), null);
  // the settle buttons live in one group that appears only on a branch
  ck('nothing to settle while on the master', $('trialSettle').hidden, true);

  console.log('\n--- first mark becomes the premise ---');
  $('trialStart').click();
  ck('branch is active', ev('!!trial'), true);
  ck('premise empty at first', ev('trial.premise'), null);
  ck('row shows no premise yet', rows()[1], 'nothing assumed yet');
  ev(`queueOp(${E0},"1")`); ev('render()');
  ck('premise captured', ev('trial.premise.idx'), E0);
  ck('premise records the target', ev('trial.premise.to'), '1');
  ck('premise records what it replaced', ev('trial.premise.from'), '0');
  ck('label reads in board terms', rows()[1], 'r1c1 top → line');
  ev(`queueOp(${E1},"2")`); ev('render()');
  ck('later marks do not overwrite the premise', ev('trial.premise.idx'), E0);

  console.log('\n--- premise is circled on the board ---');
  ck('one premise ring drawn', doc.querySelectorAll('.prem').length, 1);
  ck('ring is the current style', doc.querySelector('.prem').getAttribute('class'), 'prem');
  $('optPremise').checked = false; $('optPremise').dispatchEvent(new window.Event('change', { bubbles: true }));
  ck('toggle hides rings', doc.querySelectorAll('.prem').length, 0);
  $('optPremise').checked = true; $('optPremise').dispatchEvent(new window.Event('change', { bubbles: true }));
  ck('toggle brings them back', doc.querySelectorAll('.prem').length, 1);

  console.log('\n--- nesting: a branch inside a branch ---');
  const b1 = ev('trial.id');
  $('trialStart').click();
  const b2 = ev('trial.id');
  ck('child is active', ev('trial.id') !== b1, true);
  ck('child knows its parent', ev('trial.parent'), b1);
  ck('child inherits the parent board', ev(`room.edges[${E0}]`), '1');
  ev(`queueOp(${E2},"2")`); ev('render()');
  ck('the master, two guesses and their twins', rows().length, 5);
  ck('ancestor premise also circled', doc.querySelectorAll('.prem').length, 2);
  ck('ancestor drawn faintly', doc.querySelectorAll('.prem--anc').length, 1);

  console.log('\n--- siblings: branch again from the parent ---');
  ev(`switchBranch(${JSON.stringify(b1)})`);
  ck('back on the first branch', ev('trial.id'), b1);
  ck("child's mark is not visible here", ev(`room.edges[${E2}]`), '0');
  $('trialStart').click();
  const b3 = ev('trial.id');
  ev(`queueOp(${ev('engine.H(4,4)')},"1")`); ev('render()');
  ck('the parent holds the pair', ev(`branches.get(${JSON.stringify(b1)}).children.length`), 4);
  ck('every branch listed with its twin', rows().length, 7);

  console.log('\n--- switching branches swaps the board ---');
  ev(`switchBranch(${JSON.stringify(b2)})`);
  ck('sibling mark not visible', ev(`room.edges[${ev('engine.H(4,4)')}]`), '0');
  ck('own mark is', ev(`room.edges[${E2}]`), '2');
  ev(`switchBranch(${JSON.stringify(b3)})`);
  ck('and back again', ev(`room.edges[${ev('engine.H(4,4)')}]`), '1');
  ev('switchBranch(null)');
  ck('sheet has none of it', ev(`room.edges[${E0}]`), '0');
  ck('sheet row is active', activeRow(), 'Master');

  console.log('\n--- contradiction on a nested branch writes to its parent ---');
  ev(`switchBranch(${JSON.stringify(b2)})`);
  const prem2 = ev('trial.premise.idx'), to2 = ev('trial.premise.to');
  ck('nested premise was an x', to2, '2');
  $('trialReject').click();
  ck('moved up to the parent', ev('trial.id'), b1);
  ck('opposite written on the parent', ev(`room.edges[${prem2}]`), '1');
  ck('nested branch gone from the tree', ev(`branches.has(${JSON.stringify(b2)})`), false);
  ck('the parent keeps the other pair', ev(`branches.get(${JSON.stringify(b1)}).children`).length, 2);
  ck('deduction did NOT reach the sheet yet', ev('pending.length'), 0);

  console.log('\n--- contradiction on a root branch writes to the shared sheet ---');
  ev(`switchBranch(${JSON.stringify(b1)})`);
  const prem1 = ev('trial.premise.idx');
  $('trialReject').click();
  ck('landed back on the sheet', ev('!!trial'), false);
  ck('opposite of "line" is an x', ev(`room.edges[${prem1}]`), '2');
  ck('it is a real timestamped op', ev(`room.et[${prem1}]`) > 0, true);
  ck('queued for sync', ev('pending.length') > 0, true);
  ck('descendants went with it', ev(`branches.has(${JSON.stringify(b3)})`), false);
  ck('tree is back to just the sheet', rows(), ['Master']);
  await wait(800);
  ck('deduction reached storage', JSON.parse(mem.get('sl:room:' + ev('room.code'))).edges[prem1], '2');

  console.log('\n--- discard rules nothing out ---');
  $('trialStart').click();
  const d = ev('engine.H(1,1)');
  ev(`queueOp(${d},"1")`); ev('render()');
  $('trialDrop').click();
  ck('branch gone', ev('branches.size'), 0);
  ck('sheet untouched by the discard', ev(`room.edges[${d}]`), '0');

  console.log('\n--- a premise that is undone cannot be ruled out ---');
  $('trialStart').click();
  ev(`setEdgeUser(${d},"1",false)`);
  ck('premise on the board', ev('premiseHolds(trial)'), true);
  $('undo').click();
  ck('premise no longer holds', ev('premiseHolds(trial)'), false);
  ck('rule-out button disabled', $('trialReject').disabled, true);
  $('trialDrop').click();

  console.log('\n--- cell premises flip colour ---');
  $('trialStart').click();
  ev('queueCell(0,"1")'); ev('render()');
  ck('cell premise labelled', rows()[1], 'r1c1 → blue');
  $('trialReject').click();
  ck('blue ruled out leaves yellow', ev('room.cells[0]'), '2');

  console.log('\n--- parked branches are flagged in the tree ---');
  $('trialStart').click();
  const vtx = ev('engine.H(1,1)');
  // three lines into one dot => broken
  ev(`queueOp(${ev('engine.H(1,1)')},"1")`);
  ev(`queueOp(${ev('engine.H(1,0)')},"1")`);
  ev(`queueOp(${ev('engine.V(0,1)')},"1")`);
  ev('render()');
  ck('active branch flagged', $('trialTag').textContent, 'CONTRADICTION');
  ev('switchBranch(null)');
  const flags = [...doc.querySelectorAll('.tw__flag')].map(f => f.textContent);
  ck('parked branch still shows BROKEN', flags.includes('BROKEN'), true);
  ev(`switchBranch(${JSON.stringify(ev('[...branches.keys()][0]'))})`);
  $('trialDrop').click();

  console.log('\n--- leaving wipes the tree ---');
  $('trialStart').click();
  $('leaveroom').click();
  ck('no branches left', ev('branches.size'), 0);
  ck('not in a branch', ev('!!trial'), false);
  ck('board class cleared', doc.body.classList.contains('trialing'), false);

  console.log('\n' + '='.repeat(50));
  console.log(`${pass} passed, ${fail} failed`);
  if (errors.length) { console.log('ERRORS:'); errors.forEach(e => console.log('  ' + e)); }
  process.exit(fail || errors.length ? 1 : 0);
})();
