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
 w.confirm=()=>true; w.prompt=()=>'renamed';}});
const {window}=dom;const ev=e=>window.eval(e);const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 await wait(400);
 $('rowsIn').value='5';$('colsIn').value='5';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);
 const ids=[];
 for(let i=0;i<3;i++){ ev('switchBranch(null)'); $('trialStart').click();
   ev(`setEdgeUser(${ev(`engine.H(${i},0)`)},"1",false)`); ids.push(ev('trial.id')); }
 ev('switchBranch(null)'); ev('render()');
 const mine=()=>JSON.parse(ev('JSON.stringify(trunk.children)')).filter(id=>ids.includes(id));
 ck('made in order', mine(), ids);
 // rename the first one
 ev(`switchBranch(${JSON.stringify(ids[0])})`);
 $('trialRename').click();
 ev('switchBranch(null)'); ev('render()');
 ck('renaming leaves it where it was', mine(), ids);
 ck('the name took', ev(`branches.get(${JSON.stringify(ids[0])}).name`), 'renamed');
 // and marking on a branch should not move it either
 ev(`switchBranch(${JSON.stringify(ids[1])})`);
 ev(`setEdgeUser(${ev('engine.V(3,3)')},"2",false)`);
 ev('switchBranch(null)'); ev('render()');
 ck('drawing on a branch leaves it where it was', mine(), ids);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
