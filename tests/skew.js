/* Two machines whose clocks disagree. A mark made later in real time must not
   be discarded because the other machine's clock runs ahead. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
const shared=new Map();
function mk(skewMs){const priv=new Map();
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={async get(k,sh){const m=sh?shared:priv;return m.has(k)?{key:k,value:m.get(k)}:null},
    async set(k,v,sh){(sh?shared:priv).set(k,v);return{key:k,value:v}},
    async list(){return{keys:[]}},async delete(){return{}}};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  w.SVGElement.prototype.setPointerCapture=function(){};
  w.SVGElement.prototype.getTotalLength=()=>100;
  w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
  // this machine's clock is wrong by skewMs
  const realNow=w.Date.now;
  w.Date.now=()=>realNow()+skewMs;
  w.confirm=()=>true; w.prompt=()=>null;}});
 return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const sync=async(A,B)=>{ await wait(700); await A.ev('poll()'); await B.ev('poll()');
  await wait(500); await A.ev('poll()'); await B.ev('poll()'); await wait(500); };
(async()=>{
 // alice's clock is five minutes fast; bob's is right
 const A=mk(300000); await wait(400);
 A.$('rowsIn').value='6';A.$('colsIn').value='6';A.$('nameIn').value='alice';
 A.$('createBtn').click();
 for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
 const code=A.ev('room.code');
 await wait(800);
 const B=mk(0); await wait(300);
 B.$('nameIn').value='bob'; B.ev('switchTab(false)');
 B.$('codeIn').value=code; B.$('joinBtn').click();
 for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
 await sync(A,B);

 console.log('--- the slow clock draws over the fast one ---');
 const e=A.ev('engine.H(2,2)');
 A.ev(`setEdgeUser(${e},"1",false)`);      // alice first, with a fast clock
 await sync(A,B);
 ck("bob sees alice's line", B.ev(`room.edges[${e}]`), '1');
 B.ev(`setEdgeUser(${e},"2",false)`);      // bob changes it afterwards
 ck('bob sees his own change at once', B.ev(`room.edges[${e}]`), '2');
 await sync(A,B);
 ck("bob's change survived the round trip", B.ev(`room.edges[${e}]`), '2');
 ck('and alice sees it too', A.ev(`room.edges[${e}]`), '2');

 console.log('\n--- and a fresh mark from the slow clock ---');
 const e2=B.ev('engine.V(4,4)');
 B.ev(`setEdgeUser(${e2},"1",false)`);
 await sync(A,B);
 ck("bob's new mark is still there", B.ev(`room.edges[${e2}]`), '1');
 ck('alice has it as well', A.ev(`room.edges[${e2}]`), '1');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
