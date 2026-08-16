/* The branch list should grow rather than scroll inside itself. */
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
 Object.defineProperty(w,'innerWidth',{value:1000,writable:true,configurable:true});
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
 // a good many branches, nested
 for(let i=0;i<8;i++){
   $('trialStart').click();
   ev(`setEdgeUser(${ev(`engine.H(${i%5},${i%4})`)},"1",false)`);
 }
 ev('switchBranch(null)'); ev('render()');
 const tree=window.document.getElementById('trialTree');
 ck('all the branches are listed',
    ev(`document.querySelectorAll('.tw').length`) >= 9, true);
 ck('the list is not a scrolling box',
    ev(`getComputedStyle(document.getElementById('trialTree')).overflow`), 'visible');
 ck('and nothing caps its height',
    ev(`getComputedStyle(document.getElementById('trialTree')).maxHeight`), 'none');
 // the buttons must sit above the list, so they never shift as it grows
 const order=ev(`(()=>{
   const block=document.getElementById('trialTree').closest('.block');
   const kids=[...block.children];
   return JSON.stringify([kids.indexOf(document.getElementById('trialStart').closest('.controls')),
                          kids.indexOf(document.getElementById('trialTree'))]);
 })()`);
 const [startAt,treeAt]=JSON.parse(order);
 ck('the start button comes before the tree', startAt < treeAt && startAt >= 0, true);
 ck('so does the settle group',
    ev(`(()=>{const block=document.getElementById('trialTree').closest('.block');
      const kids=[...block.children];
      return kids.indexOf(document.getElementById('trialSettle')) <
             kids.indexOf(document.getElementById('trialTree'));})()`), true);
 void tree;
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
