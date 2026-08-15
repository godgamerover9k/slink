const fs=require('fs');const {JSDOM}=require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
const mem=new Map(); let dl=null;
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
 w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
 w.SVGElement.prototype.setPointerCapture=function(){};
 w.SVGElement.prototype.getTotalLength=()=>100;
 w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
 w.URL.createObjectURL=b=>{dl=b;return 'blob:x';}; w.URL.revokeObjectURL=()=>{};
 w.confirm=()=>true;}});
const {window}=dom;const ev=e=>window.eval(e);const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 await wait(300);
 $('rowsIn').value='5';$('colsIn').value='5';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);
 const sheetEdge=ev('engine.H(0,0)');
 ev(`setEdgeUser(${sheetEdge},"1",false)`);
 $('trialStart').click();
 const b1=ev('trial.id'); const e1=ev('engine.H(2,2)');
 ev(`setEdgeUser(${e1},"2",false)`);
 $('trialStart').click();
 const b2=ev('trial.id'); const e2=ev('engine.V(3,3)');
 ev(`setEdgeUser(${e2},"1",false)`); ev('render()');
 ck('two branches exist', ev('branches.size'), 2);

 $('exportBtn').click(); await wait(120);
 const text=await dl.text(); const save=JSON.parse(text);
 const pr=save.puzzles[0].progress;
 ck('export carries the tree', Object.keys(pr.tree||{}).length, 2);
 ck('export records which branch was open', pr.active, b2);
 ck('the sheet exported is the sheet, not the branch', pr.edges[e1], '0');
 ck('sheet mark still present', pr.edges[sheetEdge], '1');

 console.log('\n--- reimport ---');
 ev('clearBranches()');
 $('packIn').onchange({target:{files:[{name:'p.json',text:async()=>text}],value:''}});
 await wait(900);
 ck('both branches came back', ev('branches.size'), 2);
 ck('branch one kept its mark', ev(`(()=>{const n=branches.get(${JSON.stringify(b1)});return n&&n.marks.e[${e1}];})()`), '2');
 ck('branch two kept its mark', ev(`(()=>{const n=branches.get(${JSON.stringify(b2)});return n&&n.marks.e[${e2}];})()`), '1');
 ck('nesting preserved', ev(`(()=>{const n=branches.get(${JSON.stringify(b2)});return n&&n.parent;})()`), b1);
 ev(`switchBranch(${JSON.stringify(b2)})`);
 ck('deep branch shows its own and its parent mark',
    [ev(`room.edges[${e1}]`),ev(`room.edges[${e2}]`)], ['2','1']);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
