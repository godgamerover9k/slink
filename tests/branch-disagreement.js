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
const q=v=>JSON.stringify(v);
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const flags=()=>[...window.document.querySelectorAll('.tw')].map(r=>({
  label:r.querySelector('.tw__label').textContent,
  flag:r.querySelector('.tw__flag').textContent,
  red:r.classList.contains('tw--clash')}));
(async()=>{
 await wait(300);
 $('rowsIn').value='6';$('colsIn').value='6';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);
 /* A branch can no longer contradict what is above it, so the only way to end
    up disagreeing is for the master to decide something afterwards. */
 const e=ev('engine.H(2,2)');
 $('trialStart').click();
 ev(`setEdgeUser(${e},"1",false)`);            // the branch marks an open edge
 ev(`setEdgeUser(${ev('engine.V(0,0)')},"1",false)`);
 ev('switchBranch(null)');
 ev('render()');
 ck('nothing is flagged yet', flags().some(f=>f.red), false);

 ev(`setEdgeUser(${e},"2",false)`);            // the master now says otherwise
 ev('render()');
 const row=flags().find(f=>f.red);
 ck('the branch is flagged as disagreeing', !!row, true);
 ck('and says so plainly', /DISAGREES WITH ABOVE/.test(row?row.flag:''), true);

 ev(`setEdgeUser(${e},"1",false)`);            // master agrees again
 ev('render()');
 ck('agreement clears the flag', flags().some(f=>f.red), false);

 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
