/* What a branch is allowed to assume, and when that assumption may be taken
   back. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
const mem=new Map();
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
 w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
 w.SVGElement.prototype.setPointerCapture=function(){};
 w.SVGElement.prototype.getTotalLength=()=>100;
 w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
 w.confirm=()=>true; w.prompt=()=>null;}});
const {window}=dom;const ev=e=>window.eval(e);const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 await wait(400);
 $('rowsIn').value='7';$('colsIn').value='7';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);

 console.log('--- rubbing something out assumes nothing ---');
 // a branch cannot touch what the master decided, so clear one of its own
 const e1=ev('engine.H(1,1)');
 $('trialStart').click();
 ev(`setEdgeUser(${e1},"1",false)`);          // its premise
 ev(`setEdgeUser(${e1},"0",false)`);          // taken straight back
 ck('nothing is assumed once it is undone', ev('trial.premise'), null);
 ck('and the edge is clear', ev(`room.edges[${e1}]`), '0');
 const e2=ev('engine.V(2,2)');
 ev(`setEdgeUser(${e2},"1",false)`);          // now a real claim
 ck('the next real mark becomes the premise', ev('trial.premise && trial.premise.idx'), e2);
 ck('and it is what was claimed, not what was cleared',
    ev('trial.premise && trial.premise.to'), '1');

 console.log('\n--- taking the assumption back ---');
 // this branch has a second mark on it, so the assumption is now load-bearing
 ev(`setEdgeUser(${ev('engine.H(6,6)')},"1",false)`);
 ev(`setEdgeUser(${e2},"0",false)`);
 ck('refused while anything else has been changed', ev(`room.edges[${e2}]`), '1');
 ev('switchBranch(null)');

 // a branch whose only mark is its assumption
 $('trialStart').click();
 const bare=ev('engine.V(3,1)');
 ev(`setEdgeUser(${bare},"1",false)`);
 ck('that is its premise', ev('trial.premise && trial.premise.idx'), bare);
 ev(`setEdgeUser(${bare},"0",false)`);
 ck('and it can be taken back', ev(`room.edges[${bare}]`), '0');
 ck('leaving the branch with nothing assumed', ev('trial.premise'), null);
 ev('switchBranch(null)');

 $('trialStart').click();
 const e3=ev('engine.H(4,4)');
 ev(`setEdgeUser(${e3},"1",false)`);          // the premise
 ev(`setEdgeUser(${ev('engine.H(5,5)')},"2",false)`);   // something built on it
 ck('the premise is set', ev('trial.premise && trial.premise.idx'), e3);
 const before=ev(`room.edges[${e3}]`);
 ev(`setEdgeUser(${e3},"0",false)`);
 ck('now it cannot be undone', ev(`room.edges[${e3}]`), before);
 ck('and it says why', /assumption/i.test($('toast').textContent), true);
 ck('changing it to something else is refused too', (()=>{
   ev(`setEdgeUser(${e3},"2",false)`);
   return ev(`room.edges[${e3}]`);
 })(), before);
 ck('other marks still work', (()=>{
   const other=ev('engine.V(6,1)');
   ev(`setEdgeUser(${other},"1",false)`);
   return ev(`room.edges[${other}]`);
 })(), '1');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
