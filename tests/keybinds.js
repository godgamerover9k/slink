/* The held keys can be changed, and the change sticks. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
function mk(store){store=store||new Map();
 const mem=new Map();
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  w.SVGElement.prototype.setPointerCapture=function(){};
  w.SVGElement.prototype.getTotalLength=()=>100;
  w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
  Object.defineProperty(w,'localStorage',{value:{
    getItem:k=>store.has(k)?store.get(k):null,
    setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});
  w.confirm=()=>true; w.prompt=()=>null;}});
 return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i),store};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const press=(P,k,type)=>P.w.dispatchEvent(new P.w.KeyboardEvent(type||'keydown',{key:k,bubbles:true,cancelable:true}));
(async()=>{
 const A=mk(); await wait(400);
 console.log('--- the defaults ---');
 ck('diagonal is D', A.ev('keyBinds.diagonal'), 'd');
 ck('claim is R', A.ev('keyBinds.claim'), 'r');
 press(A,'d'); ck('holding D arms the diagonal', A.ev('diagHeld'), true);
 press(A,'d','keyup');

 console.log('\n--- changing one ---');
 ck('rebinding works', A.ev(`setKeyBind('diagonal','g')`), true);
 press(A,'g'); ck('the new key arms it', A.ev('diagHeld'), true);
 press(A,'g','keyup');
 press(A,'d'); ck('the old one no longer does', A.ev('diagHeld'), false);
 press(A,'d','keyup');

 console.log('\n--- what is refused ---');
 ck('a key already in use', A.ev(`setKeyBind('claim','g')`), false);
 ck('something that is not a key', A.ev(`setKeyBind('diagonal','Shift')`), false);
 ck('and an action that does not exist', A.ev(`setKeyBind('nonsense','k')`), false);
 ck('the binding survived all that', A.ev('keyBinds.diagonal'), 'g');

 console.log('\n--- next time ---');
 const B=mk(A.store); await wait(400);
 ck('the choice is remembered', B.ev('keyBinds.diagonal'), 'g');
 ck('and the panel shows it',
    /G/.test(B.ev(`document.querySelector('.keys__key').textContent`)), true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
