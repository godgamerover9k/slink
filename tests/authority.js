/* The parent is authoritative: a branch adds to what is above it and can
   never rub it out or argue with it. */
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
const q=v=>JSON.stringify(v);
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 await wait(400);
 $('rowsIn').value='7';$('colsIn').value='7';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);

 const line=ev('engine.H(1,1)'), cross=ev('engine.V(2,2)'), blank=ev('engine.H(3,3)');
 const cell=5;
 ev(`setEdgeUser(${line},"1",false)`);
 ev(`setEdgeUser(${cross},"2",false)`);
 ev(`setCellUser(${cell},"1",false)`);

 console.log('--- a branch cannot rub out what the master decided ---');
 $('trialStart').click();
 ev(`setEdgeUser(${line},"0",false)`);
 ck('the line is still there', ev(`room.edges[${line}]`), '1');
 ck('and it says why', /already decided/i.test($('toast').textContent), true);
 ev(`setEdgeUser(${line},"2",false)`);
 ck('nor can it be changed to something else', ev(`room.edges[${line}]`), '1');
 ev(`setEdgeUser(${cross},"1",false)`);
 ck('an x from above is just as fixed', ev(`room.edges[${cross}]`), '2');
 ev(`setCellUser(${cell},"2",false)`);
 ck('so is a colour', ev(`room.cells[${cell}]`), '1');
 ck('nothing was recorded on the branch', ev('Object.keys(trial.marks.e).length'), 0);

 console.log('\n--- what it may do ---');
 ev(`setEdgeUser(${blank},"1",false)`);
 ck('mark something the master left open', ev(`room.edges[${blank}]`), '1');
 ck('that became its premise', ev('trial.premise && trial.premise.idx'), blank);
 ev(`setEdgeUser(${blank},"0",false)`);
 ck('and take its own mark back again', ev(`room.edges[${blank}]`), '0');

 console.log('\n--- the same one level down ---');
 ev(`setEdgeUser(${blank},"1",false)`);        // parent branch decides this
 const parent=ev('trial.id');
 $('trialStart').click();                      // a branch off that branch
 ev(`setEdgeUser(${blank},"0",false)`);
 ck("a child cannot rub out its parent's mark", ev(`room.edges[${blank}]`), '1');
 const own=ev('engine.V(5,5)');
 ev(`setEdgeUser(${own},"2",false)`);
 ck('but can mark what is still open', ev(`room.edges[${own}]`), '2');
 ev(`switchBranch(${q(parent)})`);
 ck("and the parent never saw the child's mark", ev(`room.edges[${own}]`), '0');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
