/* A link should open straight into the puzzle, carrying the server and key
   with it, so one link is all a friend needs. */
const {spawn}=require('child_process');
const {JSDOM}=require('jsdom');
const PORT=8341, KEY='linkkey';
const base=`http://127.0.0.1:${PORT}/`;
const srv=spawn('node',['server/slink-server.js','--port',String(PORT),'--key',KEY,
  '--page','public/index.html','--data','/tmp/link.json','--noopen']);
let out='';srv.stdout.on('data',d=>out+=d);srv.stderr.on('data',d=>out+=d);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
async function player(url){
  const html = require('./pageload.js').loadPage(__dirname);
  const store=new Map();
  const dom=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
    w.fetch=(u,o)=>fetch(new URL(u,base),o);
    w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
    w.SVGElement.prototype.setPointerCapture=function(){};
    w.SVGElement.prototype.getTotalLength=()=>100;
    w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
    Object.defineProperty(w,'localStorage',{value:{
      getItem:k=>store.has(k)?store.get(k):null,
      setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});
    let copied=null;
    Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async t=>{copied=t;}},configurable:true});
    w.__copied=()=>copied;
    w.confirm=()=>true;}});
  return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};
}
(async()=>{
 try{
  for(let i=0;i<60;i++){try{if((await fetch(base+'kv/__health')).ok)break;}catch(e){}await wait(200);}
  const A=await player(base+'?k='+KEY); await wait(800);
  A.$('rowsIn').value='5';A.$('colsIn').value='5';A.$('nameIn').value='alice';
  A.$('createBtn').click();
  for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
  const code=A.ev('room.code');
  const e0=A.ev('engine.H(1,1)');
  A.ev(`setEdgeUser(${e0},"1",false)`);
  await wait(900);

  console.log('--- the copy button hands over a link ---');
  await A.$('copycode').click();
  await wait(150);
  const link=A.ev('__copied()');
  console.log('   ', link);
  ck('a link, not a bare code', /^https?:\/\//.test(link||''), true);
  ck('it names the puzzle', new URL(link).searchParams.get('room'), code);
  ck('and carries the key', new URL(link).searchParams.get('k'), KEY);
  ck('the button says so', /Copy link/.test(A.$('copycode').textContent), true);

  console.log('\n--- the top bar carries the same link ---');
  const shown=A.ev(`document.getElementById('roomcode').getAttribute('href')`);
  ck('the code is a link', shown, link);
  ck('it still reads as the code', A.ev(`document.getElementById('roomcode').textContent`), code);
  ck('and the address bar matches', A.ev('location.href'), link);
  ck('clicking it copies rather than navigating', await (async()=>{
    A.ev(`(()=>{window.__copiedReset=true;})()`);
    A.$('roomcode').click();
    await wait(150);
    return A.ev('__copied()');
  })(), link);

  console.log('\n--- opening that link joins straight away ---');
  const B=await player(link);
  for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
  ck('bob is in the puzzle', B.ev('room&&room.code'), code);
  ck('without touching the setup card', B.$('veil').hidden, true);
  ck("and sees alice's work", B.ev(`room.edges[${e0}]`), '1');

  console.log('\n--- leaving clears it from the address bar ---');
  const D=await player(link);
  for(let i=0;i<200&&!D.ev('room');i++)await wait(100);
  D.$('leaveroom').click();
  await wait(200);
  ck('no stale puzzle in the address bar',
     /[?&]room=/.test(D.ev('location.href')), false);

  console.log('\n--- a link to a puzzle that is not there ---');
  const C=await player(base+'?room=ZZZZ&k='+KEY);
  await wait(1500);
  ck('the setup card is shown', C.$('veil').hidden, false);
  ck('on the join tab', C.$('paneJoin').hidden, false);
  ck('with the code filled in', C.$('codeIn').value, 'ZZZZ');
  ck('and an explanation', /No puzzle with that code/.test(C.$('err').textContent), true);
 }catch(e){console.log('ERROR',e.message);fail++;}
 console.log(`\n${pass} passed, ${fail} failed`);
 srv.kill(); process.exit(fail?1:0);
})();
setTimeout(()=>{srv.kill();process.exit(1);},200000);
