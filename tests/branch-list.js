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

 console.log('--- you see what hangs off where you are ---');
 // on the master: its own branches, but not what hangs under them
 ev('switchBranch(null)'); ev('render()');
 ck('the master and its branches are listed', rows().length, 2);
 ck('nothing to click to expand',
    ev(`document.querySelectorAll('.tw__twist').length`), 0);

 // on the parent: its offshoot appears
 ev(`switchBranch(${q(parent)})`); ev('render()');
 ck('choosing a branch shows what is under it', rows().length, 3);

 // deeper: the whole path stays visible
 ev(`switchBranch(${q(kid)})`); ev('render()');
 ck('and the way back stays in view', rows().length, 3);

 // a second branch off the master, with its own child
 ev('switchBranch(null)');
 $('trialStart').click();
 const other=ev('trial.id');
 ev(`setEdgeUser(${ev('engine.H(5,5)')},"1",false)`);
 $('trialStart').click();
 ev(`setEdgeUser(${ev('engine.V(5,1)')},"1",false)`);
 ev(`switchBranch(${q(parent)})`); ev('render()');
 const shown=[...window.document.querySelectorAll('.tw')].map(r=>r.dataset.branch);
 ck("the other branch is listed", shown.includes(other), true);
 ck("but its offshoot is not, since you are not on it",
    shown.length, 4);
 ev(`switchBranch(${q(other)})`); ev('render()');
 const nowShown=[...window.document.querySelectorAll('.tw')].map(r=>r.dataset.branch);
 ck("its own offshoot is now in view", nowShown.length, 4);
 ck("and the first branch's offshoot has gone out of view",
    nowShown.includes(kid), false);
 ev('switchBranch(null)');

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
