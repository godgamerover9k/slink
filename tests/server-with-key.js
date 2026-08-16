/* A keyed server, as it would be exposed to the internet: two players who
   have the key can share; anyone who doesn't is refused. */
const {spawn}=require('child_process');
const {JSDOM}=require('jsdom');
const PORT=8210, KEY='testkey123';
const base=`http://127.0.0.1:${PORT}/`;
const srv=spawn('node',['server/slink-server.js','--port',String(PORT),'--key',KEY,
  '--page','public/index.html','--data','/tmp/pub.json','--noopen']);
let out='';srv.stdout.on('data',d=>out+=d);srv.stderr.on('data',d=>out+=d);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};

async function player(withKey){
  const url=base+(withKey?'?k='+KEY:'');
  const html = require('./pageload.js').loadPage(__dirname);
  const dom=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
    w.fetch=(u,o)=>fetch(new URL(u,base),o);
    w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
    w.SVGElement.prototype.setPointerCapture=function(){};
    w.SVGElement.prototype.getTotalLength=()=>100;
    w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
    w.confirm=()=>true;}});
  return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};
}
(async()=>{
 try{
  for(let i=0;i<60;i++){try{const r=await fetch(base+'kv/__health');if(r.ok)break;}catch(e){}await wait(200);}
  console.log('--- the server guards itself ---');
  ck('health says a key is needed', (await (await fetch(base+'kv/__health')).text()), 'ok key');
  ck('no key is refused', (await fetch(base+'kv/sl:room:TEST')).status, 401);
  ck('wrong key is refused', (await fetch(base+'kv/sl:room:TEST?k=nope')).status, 401);
  ck('right key is allowed', (await fetch(base+'kv/sl:room:TEST?k='+KEY)).status, 404);
  ck('keys outside the app namespace are rejected',
     (await fetch(base+'kv/etc/passwd?k='+KEY)).status, 400);
  const w=await fetch(base+'kv/sl:room:TEST?k='+KEY,{method:'PUT',body:'hello'});
  ck('writing with the key works', w.status, 200);
  ck('and reads back', await (await fetch(base+'kv/sl:room:TEST?k='+KEY)).text(), 'hello');

  console.log('\n--- two players with the key share a sheet ---');
  const A=await player(true); await wait(700);
  ck('page picked up the key', A.ev('store.key'), KEY);
  ck('key removed from the address bar', /k=/.test(A.ev('location.href')), false);
  ck('storage mode is the server', A.ev('store.mode'), 'http');
  A.$('rowsIn').value='5';A.$('colsIn').value='5';A.$('nameIn').value='alice';
  A.$('createBtn').click();
  for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
  ck('alice made a sheet', !!A.ev('room'), true);
  const code=A.ev('room.code');
  await wait(900);
  const B=await player(true); await wait(700);
  B.$('nameIn').value='bob'; B.ev('switchTab(false)');
  B.$('codeIn').value=code; B.$('joinBtn').click();
  for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
  ck('bob joined', B.ev('room&&room.code'), code);
  const e0=A.ev('engine.H(1,1)');
  A.ev(`setEdgeUser(${e0},"1",false)`);
  await wait(900); await B.ev('poll()'); await wait(500);
  ck("bob sees alice's line", B.ev(`room.edges[${e0}]`), '1');

  console.log('\n--- someone without the key cannot get in ---');
  const C=await player(false); await wait(900);
  ck('page knows it lacks the key', C.ev('store.needsKey'), true);
  ck('join is disabled', C.$('joinBtn').disabled, true);
  ck('and it says why', /room key/i.test(C.$('soloNote').textContent||C.$('soloNote').innerHTML), true);
  C.$('rowsIn').value='4';C.$('colsIn').value='4';C.$('nameIn').value='eve';
  C.$('createBtn').click();
  for(let i=0;i<300&&!C.ev('room');i++)await wait(100);
  ck('but can still play alone', !!C.ev('room'), true);
  const stored=await fetch(base+'kv/sl:room:'+C.ev('room.code')+'?k='+KEY);
  ck("and their sheet never reached the server", stored.status, 404);
 }catch(e){console.log('ERROR',e.message);fail++;}
 console.log(`\n${pass} passed, ${fail} failed`);
 srv.kill(); process.exit(fail?1:0);
})();
setTimeout(()=>{srv.kill();process.exit(1);},240000);
