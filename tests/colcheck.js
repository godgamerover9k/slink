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
(async()=>{
 await wait(300);
 $('rowsIn').value='5';$('colsIn').value='5';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);
 $('trialStart').click();
 const id=ev('trial.id');
 const e=ev('engine.H(2,2)');                     // blank on the sheet
 ev(`setEdgeUser(${e},"1",false)`); ev('render()');
 const first=ev(`segEls[${e}].getAttribute('stroke')`);
 // working alone every line is graphite; what matters is that it stays the
 // same colour, which solotest covers for the multi-player case
 ck('a branch line has a colour', !!first, true);
 ev('switchBranch(null)');
 ev(`switchBranch(${JSON.stringify(id)})`);
 const after=ev(`segEls[${e}].getAttribute('stroke')`);
 ck('and keeps it after leaving and returning', after, first);
 ck('inherited marks are not dimmed',
   ev(`[...document.querySelectorAll('.seg.on')].every(s=>getComputedStyle(s).opacity==='1'||getComputedStyle(s).opacity==='')`), true);
 // a mark made on a branch must be indistinguishable from any other
 ck('branch marks carry no special class', ev(`segEls[${e}].getAttribute('class')`), 'seg on');
 ck('no dashes on a branch line', ev(`getComputedStyle(segEls[${e}]).strokeDasharray||'none'`).replace('none',''), '');
 // an edge that is a line on this branch must not also show an x
 const shown=ev(`[...Array(engine.E).keys()].filter(i=>getComputedStyle(xEls[i]).opacity!=='0')`);
 const wantX=ev(`[...Array(engine.E).keys()].filter(i=>room.edges[i]==="2")`);
 ck('only real x marks are visible in a branch', shown, wantX);
 ck('the branch line shows no x', ev(`getComputedStyle(xEls[${e}]).opacity`), '0');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
