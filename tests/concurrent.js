/* Two people working on the same branch at the same time. Nobody's marks may
   disappear, and a mark must keep the colour of whoever made it. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
const shared=new Map();
function mk(){const priv=new Map();
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={async get(k,sh){const m=sh?shared:priv;return m.has(k)?{key:k,value:m.get(k)}:null},
    async set(k,v,sh){(sh?shared:priv).set(k,v);return{key:k,value:v}},
    async list(){return{keys:[]}},async delete(){return{}}};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  w.SVGElement.prototype.setPointerCapture=function(){};
  w.SVGElement.prototype.getTotalLength=()=>100;
  w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
  w.confirm=()=>true; w.prompt=()=>null;}});
 return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const q=v=>JSON.stringify(v);
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const sync=async(A,B)=>{ await wait(700); await A.ev('poll()'); await B.ev('poll()');
  await wait(500); await A.ev('poll()'); await B.ev('poll()'); await wait(500); };
(async()=>{
 const A=mk(); await wait(400);
 A.$('rowsIn').value='8';A.$('colsIn').value='8';A.$('nameIn').value='alice';
 A.$('createBtn').click();
 for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
 const code=A.ev('room.code');
 A.$('trialStart').click();
 const br=A.ev('trial.id');
 A.ev(`setEdgeUser(${A.ev('engine.H(1,1)')},"1",false)`);   // premise
 await wait(800);

 const B=mk(); await wait(300);
 B.$('nameIn').value='bob'; B.ev('switchTab(false)');
 B.$('codeIn').value=code; B.$('joinBtn').click();
 for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
 await sync(A,B);
 B.ev(`switchBranch(${q(br)})`);
 ck('both are on the same branch', [A.ev('trial.id'),B.ev('trial.id')], [br,br]);

 console.log('\n--- each draws on it at the same time ---');
 const ea=A.ev('engine.H(3,3)'), eb=B.ev('engine.V(5,5)');
 A.ev(`setEdgeUser(${ea},"1",false)`);
 B.ev(`setEdgeUser(${eb},"2",false)`);
 await sync(A,B);
 ck("alice still has her own mark", A.ev(`room.edges[${ea}]`), '1');
 ck("and can see bob's", A.ev(`room.edges[${eb}]`), '2');
 ck("bob still has his own mark", B.ev(`room.edges[${eb}]`), '2');
 ck("and can see alice's", B.ev(`room.edges[${ea}]`), '1');

 console.log('\n--- a mark keeps the colour of whoever made it ---');
 A.ev('render()'); B.ev('render()');
 const aliceOnA=A.ev(`segEls[${ea}].getAttribute('stroke')`);
 const aliceOnB=B.ev(`segEls[${ea}].getAttribute('stroke')`);
 ck("alice's line looks the same to both", aliceOnA, aliceOnB);
 const bobPen=B.ev(`penVar(penSlot(me.id))`);
 const alicePen=A.ev(`penVar(penSlot(me.id))`);
 ck("and it is alice's colour", aliceOnA, alicePen);
 // bob draws a line on alice's branch: it must stay bob's colour, not hers
 const eLine=B.ev('engine.V(2,4)');
 B.ev(`setEdgeUser(${eLine},"1",false)`);
 await sync(A,B);
 A.ev('render()'); B.ev('render()');
 const bobOnA=A.ev(`segEls[${eLine}].getAttribute('stroke')`);
 const bobOnB=B.ev(`segEls[${eLine}].getAttribute('stroke')`);
 ck("bob's mark looks the same to both", bobOnA, bobOnB);
 ck("and stays bob's colour on someone else's branch", bobOnB, bobPen);
 ck("the two are told apart", aliceOnA!==bobOnA, true);

 console.log('\n--- a burst of marks from both ---');
 for(let i=0;i<5;i++){
   A.ev(`setEdgeUser(${A.ev(`engine.H(6,${i})`)},"1",false)`);
   B.ev(`setEdgeUser(${B.ev(`engine.H(7,${i})`)},"2",false)`);
 }
 await sync(A,B);
 const aMarks=A.ev(`[...Array(5).keys()].map(i=>room.edges[engine.H(6,i)]).join('')`);
 const bMarks=A.ev(`[...Array(5).keys()].map(i=>room.edges[engine.H(7,i)]).join('')`);
 ck("alice's five survived", aMarks, '11111');
 ck("bob's five survived too", bMarks, '22222');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
