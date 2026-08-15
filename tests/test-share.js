/* Two independent pages sharing one storage backend, as two players would. */
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

const shared = new Map();               // the shared backend
function makePlayer(name) {
  const priv = new Map();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.storage = {
        async get(k, sh) { const m = sh ? shared : priv; return m.has(k) ? { key: k, value: m.get(k) } : null; },
        async set(k, v, sh) { (sh ? shared : priv).set(k, v); return { key: k, value: v }; },
        async list() { return { keys: [] }; }, async delete() { return {}; },
      };
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.SVGElement.prototype.setPointerCapture = function () {};
      w.SVGElement.prototype.getTotalLength = () => 100;
      w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
      w.confirm = () => true;
    },
  });
  const w = dom.window;
  return { dom, w, ev: e => w.eval(e), $: i => w.document.getElementById(i), name };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`); };
const q = v => JSON.stringify(v);

(async () => {
  const A = makePlayer('alice'), B = makePlayer('bob');
  await wait(400);

  A.$('rowsIn').value = '6'; A.$('colsIn').value = '6'; A.$('nameIn').value = 'alice';
  A.$('createBtn').click();
  for (let i = 0; i < 300 && !A.ev('room'); i++) await wait(100);
  if (!A.ev('room')) { console.log('NO ROOM'); process.exit(1); }
  const code = A.ev('room.code');
  await wait(900);

  console.log('--- bob joins alice\'s sheet ---');
  B.$('nameIn').value = 'bob';
  B.ev('switchTab(false)');
  B.$('codeIn').value = code;
  B.$('joinBtn').click();
  for (let i = 0; i < 200 && !B.ev('room'); i++) await wait(100);
  ck('bob is on the same sheet', B.ev('room.code'), code);
  ck('same puzzle', B.ev('JSON.stringify(room.clues)'), A.ev('JSON.stringify(room.clues)'));

  console.log('\n--- alice opens a branch and marks a premise ---');
  A.$('trialStart').click();
  const bid = A.ev('trial.id');
  const e0 = A.ev('engine.H(1,1)');
  A.ev(`setEdgeUser(${e0},"1",false)`);
  ck('alice sees it on her branch', A.ev(`room.edges[${e0}]`), '1');
  await wait(900);                         // let it flush
  await B.ev('poll()');
  await wait(600);

  console.log('\n--- bob sees the branch ---');
  ck('bob knows about the branch', B.ev(`branches.has(${q(bid)})`), true);
  ck('bob is still on the sheet', B.ev('!!trial'), false);
  ck("the sheet itself is untouched for bob", B.ev(`room.edges[${e0}]`), '0');
  const rows = [...B.w.document.querySelectorAll('.tw__label')].map(x => x.textContent);
  ck('bob sees it listed with its premise', rows.some(r => /r2c2 top → line/.test(r)), true);

  console.log('\n--- bob opens the same branch and sees alice\'s work ---');
  B.ev(`switchBranch(${q(bid)})`);
  ck('bob is on alice\'s branch', B.ev('trial.id'), bid);
  ck('and sees her line', B.ev(`room.edges[${e0}]`), '1');

  console.log('\n--- bob adds to it; alice sees that ---');
  const e1 = B.ev('engine.V(2,2)');
  B.ev(`setEdgeUser(${e1},"2",false)`);
  await wait(900);
  await A.ev('poll()');
  await wait(600);
  ck('alice sees bob\'s mark on the branch', A.ev(`room.edges[${e1}]`), '2');
  console.log('   alice trunk.saved:', A.ev(`trunk.saved.edges[${e1}]`),
              '| bob trunk.saved:', B.ev(`trunk.saved.edges[${e1}]`),
              '| stored sheet:', JSON.parse(shared.get('sl:room:'+code)).edges[e1],
              '| alice on branch:', A.ev('!!trial'), '| bob on branch:', B.ev('!!trial'));
  ck('the sheet still has none of it', A.ev(`trunk.saved.edges[${e1}]`), '0');

  console.log('\n--- work on the sheet flows into the branch below ---');
  A.ev('switchBranch(null)');
  const e2 = A.ev('engine.H(4,4)');
  A.ev(`setEdgeUser(${e2},"1",false)`);
  await wait(900);
  A.ev(`switchBranch(${q(bid)})`);
  ck('the branch inherits the new sheet mark', A.ev(`room.edges[${e2}]`), '1');

  console.log('\n--- a contradiction on the branch writes to the sheet for both ---');
  const prem = A.ev('trial.premise.idx');
  A.$('trialReject').click();
  ck('alice is back on the sheet', A.ev('!!trial'), false);
  ck('the opposite is on her sheet', A.ev(`room.edges[${prem}]`), '2');
  await wait(1000);
  await B.ev('poll()');
  await wait(600);
  ck('bob got the deduction', B.ev(`room.edges[${prem}]`), '2');
  ck('the branch is gone for bob too', B.ev(`branches.has(${q(bid)})`), false);
  ck('bob was moved off the deleted branch', B.ev('!!trial'), false);

  console.log('\n--- both players can branch at once without clobbering ---');
  A.$('trialStart').click(); A.ev(`setEdgeUser(${A.ev('engine.H(0,0)')},"1",false)`);
  B.$('trialStart').click(); B.ev(`setEdgeUser(${B.ev('engine.H(5,5)')},"2",false)`);
  await wait(900); await A.ev('poll()'); await wait(400);
  await B.ev('poll()'); await wait(400); await A.ev('poll()'); await wait(400);
  ck('alice sees two branches', A.ev('branches.size'), 2);
  ck('bob sees two branches', B.ev('branches.size'), 2);
  ck('alice is still on her own', A.ev('trial.by'), 'alice');
  ck('bob is still on his own', B.ev('trial.by'), 'bob');

  console.log('\n' + '='.repeat(50));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
