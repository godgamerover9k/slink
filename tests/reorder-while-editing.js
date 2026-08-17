/* One person rearranges the branch list while another is drawing on one of
   those branches. Both changes must survive. */
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
 const ids=[];
 for(let i=0;i<3;i++){ A.ev('switchBranch(null)'); A.$('trialStart').click();
   A.ev(`setEdgeUser(${A.ev(`engine.H(${i},0)`)},"1",false)`); ids.push(A.ev('trial.id')); }
 A.ev('switchBranch(null)');
 await wait(800);

 const B=mk(); await wait(300);
 B.$('nameIn').value='bob'; B.ev('switchTab(false)');
 B.$('codeIn').value=code; B.$('joinBtn').click();
 for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
 await sync(A,B);
 // three guesses, each with its twin
 ck('bob sees all three, with their twins', B.ev('branches.size'), 6);

 console.log('\n--- alice rearranges while bob draws on one ---');
 B.ev(`switchBranch(${q(ids[2])})`);
 const eb=B.ev('engine.V(4,4)');
 A.ev(`reorderBranch(${q(ids[2])},${q(ids[0])},false)`);   // move it to the front
 B.ev(`setEdgeUser(${eb},"1",false)`);                     // at the same moment
 await wait(900);
 await sync(A,B);

 ck('the new order took',
    JSON.parse(A.ev('JSON.stringify(trunk.children)')).filter(id=>ids.includes(id)),
    [ids[2],ids[0],ids[1]]);
 ck('and bob sees the same order',
    JSON.parse(B.ev('JSON.stringify(trunk.children)')).filter(id=>ids.includes(id)),
    [ids[2],ids[0],ids[1]]);
 ck("bob's mark survived the reorder", B.ev(`room.edges[${eb}]`), '1');
 A.ev(`switchBranch(${q(ids[2])})`);
 ck("and alice can see it", A.ev(`room.edges[${eb}]`), '1');

 console.log('\n--- and the other way round ---');
 A.ev('switchBranch(null)');
 const ea=A.ev('engine.H(6,6)');
 A.ev(`switchBranch(${q(ids[1])})`);
 A.ev(`setEdgeUser(${ea},"2",false)`);
 B.ev(`reorderBranch(${q(ids[1])},${q(ids[2])},false)`);
 await sync(A,B);
 ck("alice's mark survived bob's reorder", A.ev(`room.edges[${ea}]`), '2');
 ck('both agree on the order',
    JSON.parse(A.ev('JSON.stringify(trunk.children)')).filter(id=>ids.includes(id)),
    JSON.parse(B.ev('JSON.stringify(trunk.children)')).filter(id=>ids.includes(id)));
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
