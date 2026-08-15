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
 const e=ev('engine.H(2,2)');
 ev(`setEdgeUser(${e},"1",false)`);            // the sheet says: line here
 $('trialStart').click();
 const b=ev('trial.id');
 ev(`setEdgeUser(${ev('engine.V(0,0)')},"1",false)`); // agrees with everything
 ev('render()');
 ck('a branch that adds nothing contradictory is not flagged',
    flags().find(f=>/r1c1/.test(f.label)||f.red===true)?.red||false, false);
 ev(`setEdgeUser(${e},"2",false)`);            // now overwrite the sheet's line
 ev('render()');
 const row=flags().find(f=>f.red);
 ck('overwriting a decision above is flagged', !!row, true);
 ck('and says how many', /OVERWRITES 1/.test(row?row.flag:''), true);
 ev(`setEdgeUser(${e},"1",false)`);            // put it back
 ev('render()');
 ck('agreeing again clears the flag', flags().some(f=>f.red), false);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
