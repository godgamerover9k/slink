const fs=require('fs');const {JSDOM}=require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
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
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const rows=()=>[...window.document.querySelectorAll('.tw')];
const key=(el,k)=>el.dispatchEvent(new window.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
(async()=>{
 await wait(300);
 $('rowsIn').value='5';$('colsIn').value='5';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);
 $('trialStart').click(); ev(`setEdgeUser(${ev('engine.H(0,0)')},"1",false)`);
 ev('switchBranch(null)');
 $('trialStart').click(); ev(`setEdgeUser(${ev('engine.H(2,2)')},"2",false)`);
 ev('switchBranch(null)'); ev('render()');
 ck('the master, two guesses and their twins', rows().length, 5);
 ck('on the sheet to start', ev('!!trial'), false);

 key(rows()[0],'ArrowDown');
 await wait(50);
 ck('down moves to the first branch', ev('!!trial'), true);
 const first=ev('trial.id');
 key(rows().find(r=>r.getAttribute('aria-current')==='true'),'ArrowDown');
 await wait(50);
 ck('down again moves to the next', ev('trial.id')!==first, true);
 key(rows().find(r=>r.getAttribute('aria-current')==='true'),'ArrowUp');
 await wait(50);
 ck('up goes back', ev('trial.id'), first);
 key(rows().find(r=>r.getAttribute('aria-current')==='true'),'ArrowUp');
 await wait(50);
 ck('up again lands on the sheet', ev('!!trial'), false);
 key(rows()[0],'ArrowUp');
 await wait(50);
 ck('up at the top does nothing', ev('!!trial'), false);

 console.log('\n--- up and down follow the branch you are on ---');
 // without touching the list first: whichever row is current moves
 ev('switchBranch(null)'); ev('render()');
 const current=()=>[...window.document.querySelectorAll('.tw')]
   .find(r=>r.getAttribute('aria-current')==='true');
 ck('the master is current', !!current(), true);
 key(current(),'ArrowDown');
 await wait(50);
 ck('down from the master reaches the first branch', ev('!!trial'), true);
 const one=ev('trial.id');
 key(current(),'ArrowDown');
 await wait(50);
 ck('down again moves on', ev('trial.id')!==one, true);
 key(current(),'ArrowUp');
 await wait(50);
 ck('and up comes back', ev('trial.id'), one);

 console.log('\n--- the board still scrolls with arrows ---');
 ev('zoomAt(view.x+view.w/2,view.y+view.h/2,2)');
 const before=ev('view.y');
 window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
 await wait(50);
 ck('arrow keys outside the list still pan', ev('view.y')>before, true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
