/* Settling a branch can lead straight into the next one, when asked. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
const mem=new Map();
const store=new Map();
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
 w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
 w.SVGElement.prototype.setPointerCapture=function(){};
 w.SVGElement.prototype.getTotalLength=()=>100;
 w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
 Object.defineProperty(w,'localStorage',{value:{
   getItem:k=>store.has(k)?store.get(k):null,
   setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});
 w.confirm=()=>true; w.prompt=()=>null;}});
const {window}=dom;const ev=e=>window.eval(e);const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 await wait(400);
 $('rowsIn').value='6';$('colsIn').value='6';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);

 console.log('--- off by default ---');
 ck('the toggle starts off', $('optChain').checked, false);
 $('trialStart').click();
 ev(`setEdgeUser(${ev('engine.H(1,1)')},"1",false)`);
 $('trialDrop').click();
 await wait(100);
 ck('discarding leaves you on the master', ev('!!trial'), false);

 console.log('\n--- turned on ---');
 $('optChain').checked=true;
 $('optChain').dispatchEvent(new window.Event('change',{bubbles:true}));
 ck('the choice is remembered', store.get('sl:chain'), '1');

 $('trialStart').click();
 const first=ev('trial.id');
 ev(`setEdgeUser(${ev('engine.H(2,2)')},"1",false)`);
 $('trialDrop').click();
 await wait(150);
 ck('discarding puts you on a new branch', ev('!!trial'), true);
 ck('and it is not the one just discarded', ev('trial.id')!==first, true);
 ck('with nothing assumed yet', ev('trial.premise'), null);
 ck('hanging off the master', ev('trial.parent'), null);

 console.log('\n--- and after accepting ---');
 ev(`setEdgeUser(${ev('engine.V(3,3)')},"1",false)`);
 const second=ev('trial.id');
 $('trialAccept').click();
 await wait(200);
 ck('accepting also leads into a new branch', ev('!!trial'), true);
 ck('again a fresh one', ev('trial.id')!==second, true);

 console.log('\n--- the settle buttons appear as a group ---');
 ev('switchBranch(null)'); ev('render()');
 ck('hidden on the master', $('trialSettle').hidden, true);
 $('trialStart').click(); ev('render()');
 ck('shown on a branch', $('trialSettle').hidden, false);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
