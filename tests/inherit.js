/* A change on the master must show up on branches hanging off it. */
const fs=require('fs');const {JSDOM}=require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
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
  w.confirm=()=>true;}});
 return {ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const q=v=>JSON.stringify(v);
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 const A=mk(); await wait(400);
 A.$('rowsIn').value='6';A.$('colsIn').value='6';A.$('nameIn').value='alice';
 A.$('createBtn').click();
 for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
 A.$('trialStart').click();
 const br=A.ev('trial.id');
 A.ev(`setEdgeUser(${A.ev('engine.H(0,0)')},"1",false)`);   // premise
 A.ev('switchBranch(null)');

 console.log('--- my own edit on the master ---');
 const e1=A.ev('engine.H(3,3)');
 A.ev(`setEdgeUser(${e1},"1",false)`);
 A.ev(`switchBranch(${q(br)})`);
 ck('the branch shows it', A.ev(`room.edges[${e1}]`), '1');
 A.ev('switchBranch(null)');

 console.log('\n--- an edit made while I am sitting on the branch ---');
 A.ev(`switchBranch(${q(br)})`);
 const e2=A.ev('engine.V(4,4)');
 // simulate the master changing underneath: write it into the sheet snapshot
 // the way an incoming sync does, then re-derive
 A.ev(`(()=>{const s=trunk.saved; trunk.saved={...s,edges:s.edges.slice(0,${e2})+"1"+s.edges.slice(${e2}+1)};})()`);
 A.ev('refreshBase(); loadSnapshot(deriveBoard(trial)); render();');
 ck('the branch picks it up', A.ev(`room.edges[${e2}]`), '1');
 A.ev('switchBranch(null)');

 console.log('\n--- another player edits the master ---');
 await wait(900);
 const B=mk(); await wait(300);
 B.$('nameIn').value='bob'; B.ev('switchTab(false)');
 B.$('codeIn').value=A.ev('room.code'); B.$('joinBtn').click();
 for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
 A.ev(`switchBranch(${q(br)})`);                     // alice waits on the branch
 const e3=B.ev('engine.H(5,2)');
 B.ev(`setEdgeUser(${e3},"1",false)`);
 await wait(1000);
 await A.ev('poll()'); await wait(600);
 ck("alice's branch shows bob's line", A.ev(`room.edges[${e3}]`), '1');
 ck('and the sheet underneath has it too', A.ev(`trunk.saved.edges[${e3}]`), '1');

 console.log('\n--- a branch that decided otherwise keeps its own answer ---');
 const e4=A.ev('engine.V(1,3)');
 A.ev(`setEdgeUser(${e4},"2",false)`);                // branch says x
 A.ev('switchBranch(null)');
 A.ev(`setEdgeUser(${e4},"1",false)`);                // master says line
 A.ev(`switchBranch(${q(br)})`);
 ck('the branch keeps its x', A.ev(`room.edges[${e4}]`), '2');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
