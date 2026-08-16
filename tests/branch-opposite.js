/* Trying the other half of a guess without building it by hand. */
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

 console.log('--- from a line to an x ---');
 $('trialStart').click();
 const first=ev('trial.id');
 const e=ev('engine.H(2,2)');
 ev(`setEdgeUser(${e},"1",false)`);
 ev(`setEdgeUser(${ev('engine.V(3,3)')},"1",false)`);   // some work on it
 $('trialFlip').click();
 await wait(60);
 ck('a new branch is opened', ev('trial.id')!==first, true);
 ck('assuming the opposite', ev(`room.edges[${e}]`), '2');
 ck('recorded as its premise', ev('trial.premise && trial.premise.idx'), e);
 ck('and it is the opposite value', ev('trial.premise && trial.premise.to'), '2');
 ck('hanging off the same parent', ev('trial.parent'), null);
 ck('the first branch is untouched', ev(`branches.get(${JSON.stringify(first)}).marks.e[${e}]`), '1');

 console.log('\n--- and back again ---');
 $('trialFlip').click();
 await wait(60);
 ck('flipping again returns to a line', ev(`room.edges[${e}]`), '1');

 console.log('\n--- with nothing assumed ---');
 ev('switchBranch(null)');
 $('trialStart').click();
 $('trialFlip').click();
 await wait(60);
 ck('it asks for an assumption first', /Assume something first/.test($('toast').textContent), true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
