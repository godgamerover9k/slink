/* Starts the real room server, then loads the page twice over HTTP —
   no window.storage anywhere, exactly like two people on two computers. */
const { spawn } = require('child_process');
const { JSDOM } = require('jsdom');
const fs = require('fs');

const PORT = 8123;
const srv = spawn('node', ['server/slink-server.js', '--port', String(PORT),
  '--page', 'public/index.html', '--data', '/tmp/rooms-test.json', '--noopen', '--open']);
let out = '';
srv.stdout.on('data', d => out += d);
srv.stderr.on('data', d => out += d);

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`); };

const base = `http://127.0.0.1:${PORT}/`;

async function makePlayer(name) {
  const html = require('./pageload.js').loadPage(__dirname);
  const dom = new JSDOM(html, {
    url: base, runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      // deliberately NO w.storage: this is the plain-browser case
      w.fetch = (u, o) => fetch(new URL(u, base), o);
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      w.SVGElement.prototype.setPointerCapture = function () {};
      w.SVGElement.prototype.getTotalLength = () => 100;
      w.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel() {} });
      w.confirm = () => true;
    },
  });
  return { w: dom.window, ev: e => dom.window.eval(e), $: i => dom.window.document.getElementById(i), name };
}

(async () => {
  try {
    // wait for the server to come up
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(base + 'kv/__health'); if (r.ok) break; } catch (e) {}
      await wait(200);
    }
    console.log('--- server ---');
    console.log(out.split('\n').filter(l => l.includes('http://localhost') || l.includes('Serving page')).join('\n'));
    ck('health endpoint answers', (await fetch(base + 'kv/__health')).ok, true);
    ck('serves the page', /Start plotting/.test(await (await fetch(base)).text()), true);

    const A = await makePlayer('alice');
    await wait(700);
    ck('page detects the room server', A.ev('store.mode'), 'http');
    ck('and reports itself as shareable', A.ev('store.ok'), true);
    ck('join tab is usable', A.$('joinBtn').disabled, false);

    console.log('\n--- alice starts a sheet ---');
    A.$('rowsIn').value = '6'; A.$('colsIn').value = '6'; A.$('nameIn').value = 'alice';
    A.$('createBtn').click();
    for (let i = 0; i < 300 && !A.ev('room'); i++) await wait(100);
    ck('a sheet opened', !!A.ev('room'), true);
    const code = A.ev('room.code');
    console.log('   code:', code);
    await wait(900);
    ck('the room reached the server', (await fetch(base + 'kv/sl:room:' + code)).ok, true);

    console.log('\n--- bob joins from a separate page ---');
    const B = await makePlayer('bob');
    await wait(700);
    B.$('nameIn').value = 'bob';
    B.ev('switchTab(false)');
    B.$('codeIn').value = code;
    B.$('joinBtn').click();
    for (let i = 0; i < 200 && !B.ev('room'); i++) await wait(100);
    ck('bob is on the sheet', B.ev('room && room.code'), code);
    ck('same puzzle', B.ev('JSON.stringify(room.clues)'), A.ev('JSON.stringify(room.clues)'));

    console.log('\n--- drawing crosses between them ---');
    const e0 = A.ev('engine.H(2,2)');
    A.ev(`setEdgeUser(${e0},"1",false)`);
    await wait(900);
    await B.ev('poll()');
    await wait(500);
    ck("bob sees alice's line", B.ev(`room.edges[${e0}]`), '1');

    const e1 = B.ev('engine.V(3,3)');
    B.ev(`setEdgeUser(${e1},"2",false)`);
    await wait(900);
    await A.ev('poll()');
    await wait(500);
    ck("alice sees bob's x", A.ev(`room.edges[${e1}]`), '2');

    console.log('\n--- branches share too ---');
    A.$('trialStart').click();
    const bid = A.ev('trial.id');
    A.ev(`setEdgeUser(${A.ev('engine.H(1,1)')},"1",false)`);
    await wait(900);
    await B.ev('poll()');
    await wait(500);
    ck('bob sees the branch', B.ev(`branches.has(${JSON.stringify(bid)})`), true);

    console.log('\n--- both players appear on the pen rack ---');
    const names = A.ev('room.players.map(p=>p.name).join(",")');
    ck('alice and bob both listed', /alice/.test(names) && /bob/.test(names), true);

    console.log('\n--- rooms survive on disk ---');
    await wait(900);
    const saved = JSON.parse(fs.readFileSync('/tmp/rooms-test.json', 'utf8'));
    ck('room persisted to the data file', !!saved['sl:room:' + code], true);
  } catch (e) {
    console.log('ERROR', e.message);
    fail++;
  }
  console.log('\n' + '='.repeat(50));
  console.log(`${pass} passed, ${fail} failed`);
  srv.kill();
  process.exit(fail ? 1 : 0);
})();
