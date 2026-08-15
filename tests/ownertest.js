/* The person who opened a sheet owns the puzzle; everyone else can draw on it
   but not replace it. */
const fs=require('fs');const {JSDOM}=require('jsdom');
const path=require('path');
/* the page is index.html in the repository, and slitherlink-plotroom.html when
   working on it loose; accept either */
function pagePath(){
  for(const p of ['index.html','slitherlink-plotroom.html',
                  path.join(__dirname,'..','index.html')])
    if(require('fs').existsSync(p))return p;
  throw new Error('cannot find the page next to these tests');
}

const html=fs.readFileSync(pagePath(),'utf8');
const shared=new Map();
function makePlayer(){
  const priv=new Map();
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
    w.storage={
      async get(k,sh){const m=sh?shared:priv;return m.has(k)?{key:k,value:m.get(k)}:null},
      async set(k,v,sh){(sh?shared:priv).set(k,v);return{key:k,value:v}},
      async list(){return{keys:[]}},async delete(){return{}}};
    w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
    w.SVGElement.prototype.setPointerCapture=function(){};
    w.SVGElement.prototype.getTotalLength=()=>100;
    w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
    w.confirm=()=>true;}});
  return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 const A=makePlayer(), B=makePlayer();
 await wait(400);
 A.$('rowsIn').value='5';A.$('colsIn').value='5';A.$('nameIn').value='alice';
 A.$('createBtn').click();
 for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
 const code=A.ev('room.code');
 ck('the sheet records its owner', A.ev('room.owner')===A.ev('me.id'), true);
 ck('and their name', A.ev('room.ownerName'), 'alice');
 await wait(900);

 B.$('nameIn').value='bob'; B.ev('switchTab(false)');
 B.$('codeIn').value=code; B.$('joinBtn').click();
 for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
 ck('bob joined', B.ev('room&&room.code'), code);
 ck('bob is not the owner', B.ev('isOwner()'), false);
 ck('alice still is', A.ev('isOwner()'), true);

 console.log('\n--- the control says so ---');
 B.ev('render()'); A.ev('render()');
 ck('alice sees the normal button', A.$('newsheet').textContent, 'Load a new puzzle');
 ck('alice can press it', A.$('newsheet').disabled, false);
 ck('bob is told whose it is', /Only alice/.test(B.$('newsheet').textContent), true);
 ck('and cannot press it', B.$('newsheet').disabled, true);

 console.log('\n--- and pressing it anyway does nothing ---');
 const before=B.ev('JSON.stringify(room.clues)');
 B.$('newsheet').onclick();
 await wait(200);
 ck('the puzzle is unchanged', B.ev('JSON.stringify(room.clues)'), before);
 ck('the setup card did not open', B.$('veil').hidden, true);
 ck('bob was told why', /Only alice/.test(B.$('toast').textContent), true);

 console.log('\n--- bob can still play, and can leave to make his own ---');
 const e0=B.ev('engine.H(1,1)');
 B.ev(`setEdgeUser(${e0},"1",false)`);
 ck('bob can draw', B.ev(`room.edges[${e0}]`), '1');
 B.$('leaveroom').click();
 await wait(200);
 ck('leaving opens the setup card', B.$('veil').hidden, false);

 console.log('\n--- an older sheet with no owner stays open to all ---');
 A.ev('room.owner=null; room.ownerName=""; render()');
 ck('no owner recorded means no restriction', A.ev('isOwner()'), true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
