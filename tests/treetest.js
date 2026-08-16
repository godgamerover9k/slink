/* The branch list: offshoots tucked away, and a branch whose premise has since
   been settled above it marked as no longer a guess. */
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
 w.confirm=()=>true;}});
const {window}=dom;const ev=e=>window.eval(e);const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const q=v=>JSON.stringify(v);
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const rows=()=>[...window.document.querySelectorAll('.tw__label')].map(e=>e.textContent);
(async()=>{
 await wait(400);
 $('rowsIn').value='6';$('colsIn').value='6';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);

 const e1=ev('engine.H(2,2)');
 $('trialStart').click();
 const parent=ev('trial.id');
 ev(`setEdgeUser(${e1},"1",false)`);      // premise
 $('trialStart').click();
 const kid=ev('trial.id');
 ev(`setEdgeUser(${ev('engine.V(4,4)')},"1",false)`);
 ev('switchBranch(null)'); ev('render()');

 console.log('--- offshoots are tucked away until you look ---');
 // visiting a branch opens it, so start from a folded list
 ev('openBranches.clear(); switchBranch(null); render()');
 ck('only the master and the parent are listed', rows().length, 2);
 const twist=window.document.querySelector('.tw__twist');
 ck('a marker shows there is something inside', !!twist, true);
 ck('and says how many', /1/.test(twist.textContent), true);
 // clicking the branch itself opens it; the marker is only a sign
 const rowFor=id=>[...window.document.querySelectorAll('.tw')]
   .find(r=>r.dataset.branch===id);
 rowFor(parent).onclick();
 ev('render()');
 ck('clicking the branch reveals the offshoot', rows().length, 3);
 rowFor(parent).onclick();
 ev('render()');
 ck('clicking it again folds it away', rows().length, 2);
 ck('the marker itself is not the control',
    ev(`getComputedStyle(document.querySelector('.tw__twist')).pointerEvents`), 'none');

 console.log('\n--- choosing a branch opens what is under it ---');
 ev('openBranches.clear(); switchBranch(null); render()');
 ck('folded to begin with', rows().length, 2);
 ev(`switchBranch(${q(parent)})`); ev('render()');
 ck('picking the parent reveals its offshoot', rows().length, 3);
 ck('and no tooltip is left on the rows',
    ev(`[...document.querySelectorAll('.tw')].every(r=>!r.title)`), true);

 console.log('\n--- the branch you are on is always reachable ---');
 ev('openBranches.clear();');
 ev(`switchBranch(${q(kid)})`);
 ev('render()');
 ck('its parent is opened for you', rows().length, 3);
 ev('switchBranch(null)'); ev('render()');

 console.log('\n--- a premise settled above is no longer a guess ---');
 const flags=()=>[...window.document.querySelectorAll('.tw__flag')].map(e=>e.textContent);
 ck('nothing claimed yet', flags().some(f=>/ALREADY TRUE/.test(f)), false);
 ev(`setEdgeUser(${e1},"1",false)`);      // the master now says the same thing
 ev('render()');
 ck('marked as already true', flags().some(f=>/ALREADY TRUE/.test(f)), true);
 ck('and shown as settled, not broken',
    ev(`[...document.querySelectorAll('.tw__flag')].some(e=>e.className.includes('good'))`), true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
