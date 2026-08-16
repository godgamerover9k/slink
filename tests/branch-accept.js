const fs=require('fs');const {JSDOM}=require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
const mem=new Map();
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[...mem.keys()]}},async delete(){return{}}};
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
(async()=>{
 await wait(300);
 $('rowsIn').value='6';$('colsIn').value='6';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);
 await wait(700);

 console.log('--- accepting a root branch puts its work on the sheet ---');
 $('trialStart').click();
 const b1=ev('trial.id');
 const e1=ev('engine.H(1,1)'), c1=3;
 ev(`setEdgeUser(${e1},"1",false)`);
 ev(`setCellUser(${c1},"1",false)`);
 ck('button is offered', $('trialAccept').hidden, false);
 $('trialAccept').click();
 await wait(200);
 ck('left the branch', ev('!!trial'), false);
 ck('branch is gone', ev('branches.size'), 0);
 ck('line landed on the sheet', ev(`room.edges[${e1}]`), '1');
 ck('colour landed too', ev(`room.cells[${c1}]`), '1');
 ck('it is a real synced op', ev(`room.et[${e1}]`)>0, true);
 await wait(900);
 ck('reached storage', JSON.parse(mem.get('sl:room:'+ev('room.code'))).edges[e1], '1');

 console.log('\n--- one undo takes the whole acceptance back ---');
 $('undo').click();
 ck('line reverted', ev(`room.edges[${e1}]`), '0');
 ck('colour reverted', ev(`room.cells[${c1}]`), '0');
 $('redo').click();
 ck('and redo restores it', ev(`room.edges[${e1}]`), '1');

 console.log('\n--- accepting a middle branch keeps its offshoots ---');
 $('trialStart').click();
 const p1=ev('trial.id');
 const ep=ev('engine.V(2,2)');
 ev(`setEdgeUser(${ep},"2",false)`);
 $('trialStart').click();                     // child of p1
 const kid=ev('trial.id');
 const ek=ev('engine.H(4,4)');
 ev(`setEdgeUser(${ek},"1",false)`);
 ev(`switchBranch(${q(p1)})`);
 $('trialAccept').click();
 await wait(200);
 ck('the accepted branch is gone', ev(`branches.has(${q(p1)})`), false);
 ck('its offshoot survives', ev(`branches.has(${q(kid)})`), true);
 ck('offshoot now hangs off the sheet', ev(`branches.get(${q(kid)}).parent`), null);
 ck('accepted mark is on the sheet', ev(`room.edges[${ep}]`), '2');
 ev(`switchBranch(${q(kid)})`);
 ck('offshoot still shows its own mark', ev(`room.edges[${ek}]`), '1');
 ck('and inherits the accepted one', ev(`room.edges[${ep}]`), '2');
 ev('switchBranch(null)');

 console.log('\n--- accepting a nested branch feeds its parent, not the sheet ---');
 ev('clearBranches()');
 $('trialStart').click(); const outer=ev('trial.id');
 $('trialStart').click(); const inner=ev('trial.id');
 const en=ev('engine.V(1,4)');
 ev(`setEdgeUser(${en},"1",false)`);
 $('trialAccept').click();
 await wait(200);
 ck('moved up to the outer branch', ev('trial && trial.id'), outer);
 ck('mark is on the outer branch', ev(`room.edges[${en}]`), '1');
 ev('switchBranch(null)');
 ck('but not on the sheet', ev(`room.edges[${en}]`), '0');

 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
