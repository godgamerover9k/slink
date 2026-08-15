/* The page hosted on one origin (like Vercel) with the room server on another
   (like Render). Two players must still meet through it. */
const {spawn}=require('child_process');
const path=require('path');
/* the page is index.html in the repository, and slitherlink-plotroom.html when
   working on it loose; accept either */
function pagePath(){
  for(const p of ['index.html','slitherlink-plotroom.html',
                  path.join(__dirname,'..','index.html')])
    if(require('fs').existsSync(p))return p;
  throw new Error('cannot find the page next to these tests');
}

const http=require('http');
const fs=require('fs');
const {JSDOM}=require('jsdom');
const PAGE_PORT=8261, ROOM_PORT=8262, KEY='splitkey';
const pageBase=`http://127.0.0.1:${PAGE_PORT}/`;
const roomBase=`http://127.0.0.1:${ROOM_PORT}`;

// a dumb static host, standing in for Vercel: it serves the page and nothing else
const html=fs.readFileSync(pagePath());
const statics=http.createServer((req,res)=>{
  if(req.url.startsWith('/kv/')){ res.writeHead(404); return res.end('no server here'); }
  res.writeHead(200,{'Content-Type':'text/html'}); res.end(html);
}).listen(PAGE_PORT);

const srv=spawn('node',['slink-server.js','--port',String(ROOM_PORT),'--key',KEY,'--noopen','--data','/tmp/split.json']);
let out=''; srv.stdout.on('data',d=>out+=d); srv.stderr.on('data',d=>out+=d);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};

function player(url,store){
  store=store||new Map();
  const dom=new JSDOM(html.toString(),{url,runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){
      w.fetch=(u,o)=>fetch(new URL(u,pageBase),o);
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
  for(let i=0;i<60;i++){try{if((await fetch(roomBase+'/kv/__health')).ok)break;}catch(e){}await wait(200);}
  console.log('--- the page host has no room server of its own ---');
  ck('static host 404s /kv', (await fetch(pageBase+'kv/__health')).status, 404);

  console.log('\n--- a plain visit finds nothing, and says so ---');
  const plain=player(pageBase); await wait(800);
  ck('no server found', plain.ev('store.ok'), false);
  ck('it explains', /Paste one above|on your own/.test(plain.$('serverNote').textContent), true);

  console.log('\n--- the link carries the server and the key ---');
  const link=pageBase+'?server='+encodeURIComponent(roomBase)+'&k='+KEY;
  const A=player(link); await wait(1200);
  ck('found the room server', A.ev('store.mode'), 'http');
  ck('remembered where it is', A.ev('store.base'), roomBase);
  ck('and the key', A.ev('store.key'), KEY);
  ck('cleaned the address bar', /server=|k=/.test(A.ev('location.href')), false);
  ck('shows what it is connected to', /Connected to/.test(A.$('serverNote').textContent), true);

  console.log('\n--- two players meet across the two origins ---');
  A.$('rowsIn').value='5';A.$('colsIn').value='5';A.$('nameIn').value='alice';
  A.$('createBtn').click();
  for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
  const code=A.ev('room.code');
  ck('alice opened a sheet', !!code, true);
  await wait(900);
  const B=player(link); await wait(1200);
  B.$('nameIn').value='bob'; B.ev('switchTab(false)');
  B.$('codeIn').value=code; B.$('joinBtn').click();
  for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
  ck('bob joined', B.ev('room&&room.code'), code);
  const e0=A.ev('engine.H(1,1)');
  A.ev(`setEdgeUser(${e0},"1",false)`);
  await wait(900); await B.ev('poll()'); await wait(500);
  ck('drawing crosses between them', B.ev(`room.edges[${e0}]`), '1');
  ck('the room is on the room server',
     (await fetch(roomBase+'/kv/sl:room:'+code+'?k='+KEY)).status, 200);

  console.log('\n--- returning without the link still works ---');
  const A2=player(pageBase,A.store); await wait(1200);
  ck('server remembered from last time', A2.ev('store.base'), roomBase);
  ck('key remembered too', A2.ev('store.key'), KEY);
  ck('still connected', A2.ev('store.ok'), true);

  console.log('\n--- and it can be typed in by hand ---');
  const C=player(pageBase); await wait(800);
  C.$('serverIn').value=roomBase;
  C.$('serverIn').onchange();
  await wait(1200);
  ck('typing an address connects', C.ev('store.mode'), 'http');
  ck('but without a key it says so', C.ev('store.needsKey'), true);
 }catch(e){console.log('ERROR',e.message);fail++;}
 console.log(`\n${pass} passed, ${fail} failed`);
 srv.kill(); statics.close(); process.exit(fail?1:0);
})();
setTimeout(()=>{srv.kill();statics.close();process.exit(1);},200000);
