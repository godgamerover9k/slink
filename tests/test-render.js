/* Start the server the way a host does: npm start, PORT and SLINK_KEY from
   the environment, no terminal. Then check two players can meet, and that
   each one's own progress stays in their browser rather than on the server. */
const {spawn}=require('child_process');
const {JSDOM}=require('jsdom');
const PORT=8241, KEY='purple-otter-42';
const base=`http://127.0.0.1:${PORT}/`;
const srv=spawn('npm',['start'],{cwd:'deploy',env:{...process.env,PORT:String(PORT),SLINK_KEY:KEY}});
let out='';srv.stdout.on('data',d=>out+=d);srv.stderr.on('data',d=>out+=d);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};

async function player(){
  const html=await (await fetch(base)).text();
  const store=new Map();                    // this browser's own storage
  const dom=new JSDOM(html,{url:base+'?k='+KEY,runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){
      w.fetch=(u,o)=>fetch(new URL(u,base),o);
      w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
      w.SVGElement.prototype.setPointerCapture=function(){};
      w.SVGElement.prototype.getTotalLength=()=>100;
      w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
      Object.defineProperty(w,'localStorage',{value:{
        getItem:k=>store.has(k)?store.get(k):null,
        setItem:(k,v)=>store.set(k,String(v)),
        removeItem:k=>store.delete(k)}});
      w.confirm=()=>true;}});
  return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i),store};
}
(async()=>{
 try{
  for(let i=0;i<80;i++){try{const r=await fetch(base+'kv/__health');if(r.ok)break;}catch(e){}await wait(250);}
  console.log('--- started the way Render starts it ---');
  ck('npm start served the page', /Start plotting/.test(await (await fetch(base)).text()), true);
  ck('took the port from the environment', out.includes(':'+PORT+'/'), true);
  ck('took the key from the environment', out.includes(KEY), true);
  ck('did not try to open a browser', /Leave this window open/.test(out), false);
  ck('says it may sleep', /sleeps when/.test(out), true);

  console.log('\n--- two players meet through it ---');
  const A=await player(); await wait(700);
  A.$('rowsIn').value='5';A.$('colsIn').value='5';A.$('nameIn').value='alice';
  A.$('createBtn').click();
  for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
  const code=A.ev('room.code');
  ck('alice opened a sheet', !!code, true);
  await wait(900);
  const B=await player(); await wait(700);
  B.$('nameIn').value='bob'; B.ev('switchTab(false)');
  B.$('codeIn').value=code; B.$('joinBtn').click();
  for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
  ck('bob joined by code', B.ev('room&&room.code'), code);
  const e0=A.ev('engine.H(1,1)');
  A.ev(`setEdgeUser(${e0},"1",false)`);
  await wait(900); await B.ev('poll()'); await wait(500);
  ck('drawing crosses between them', B.ev(`room.edges[${e0}]`), '1');

  console.log('\n--- progress is kept in each browser, not on the server ---');
  await wait(1200);
  ck('alice kept her own last-sheet locally', A.store.has('sl:last'), true);
  ck('bob kept his separately', B.store.has('sl:last'), true);
  ck("they are different browsers' copies", A.store.get('sl:me')!==B.store.get('sl:me'), true);
  const onServer=await fetch(base+'kv/sl:last?k='+KEY);
  ck('nothing private reached the server', onServer.status, 404);

  console.log('\n--- and it comes back when you return ---');
  const A2=await (async()=>{
    const html=await (await fetch(base)).text();
    const dom=new JSDOM(html,{url:base+'?k='+KEY,runScripts:'dangerously',pretendToBeVisual:true,
      beforeParse(w){
        w.fetch=(u,o)=>fetch(new URL(u,base),o);
        w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
        w.SVGElement.prototype.setPointerCapture=function(){};
        w.SVGElement.prototype.getTotalLength=()=>100;
        w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
        Object.defineProperty(w,'localStorage',{value:{
          getItem:k=>A.store.has(k)?A.store.get(k):null,
          setItem:(k,v)=>A.store.set(k,String(v)),
          removeItem:k=>A.store.delete(k)}});
        w.confirm=()=>true;}});
    return {ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};
  })();
  for(let i=0;i<60&&!A2.ev('room');i++)await wait(150);
  ck('reopening picks the sheet back up', A2.ev('room&&room.code'), code);
  ck('with the work still on it', A2.ev(`room.edges[${e0}]`), '1');
 }catch(e){console.log('ERROR',e.message);fail++;}
 console.log(`\n${pass} passed, ${fail} failed`);
 srv.kill('SIGTERM'); spawn('pkill',['-f','slink-server.js']);
 process.exit(fail?1:0);
})();
setTimeout(()=>{srv.kill();process.exit(1);},240000);
