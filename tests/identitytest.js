/* Changing who you are, without leaving the puzzle. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
const shared=new Map();
function mk(asks){const priv=new Map();
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={async get(k,sh){const m=sh?shared:priv;return m.has(k)?{key:k,value:m.get(k)}:null},
    async set(k,v,sh){(sh?shared:priv).set(k,v);return{key:k,value:v}},
    async list(){return{keys:[]}},async delete(){return{}}};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  w.SVGElement.prototype.setPointerCapture=function(){};
  w.SVGElement.prototype.getTotalLength=()=>100;
  w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
  const store=new Map();
  Object.defineProperty(w,'localStorage',{value:{
    getItem:k=>store.has(k)?store.get(k):null,
    setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});
  w.confirm=()=>true; w.prompt=()=>asks;}});
 return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 const A=mk('Mara'); await wait(400);
 A.$('rowsIn').value='5';A.$('colsIn').value='5';A.$('nameIn').value='alice';
 A.$('createBtn').click();
 for(let i=0;i<300&&!A.ev('room');i++)await wait(100);

 console.log('--- changing your name ---');
 ck('the control is offered once in a puzzle', A.$('meEdit').hidden, false);
 const before=A.ev('me.name');
 ck('starts as typed', before, 'alice');
 A.ev(`setMyName("Mara")`);
 ck('your name changes', A.ev('me.name'), 'Mara');
 ck('and the player list follows',
    A.ev(`room.players.find(p=>p.id===me.id).name`), 'Mara');
 ck('shown on the rack',
    /Mara/.test(A.ev(`document.querySelector('.pen__name').textContent`)), true);
 ck('an empty name is refused', A.ev(`setMyName("   ")`), false);
 ck('and leaves the old one', A.ev('me.name'), 'Mara');

 console.log('\n--- changing your colour ---');
 const e0=A.ev('engine.H(1,1)');
 A.ev(`setEdgeUser(${e0},"1",false)`);
 const was=A.ev(`segEls[${e0}].getAttribute('stroke')`);
 A.ev('setMyPen(3)');
 const now2=A.ev(`segEls[${e0}].getAttribute('stroke')`);
 ck('the choice is recorded', A.ev(`room.players.find(p=>p.id===me.id).pen`), 3);
 ck('lines already drawn change with it', now2 !== was, true);
 ck('to the colour picked', now2, 'var(--pen-4)');
 ck('the rack agrees',
    A.ev(`document.querySelector('.pen').style.getPropertyValue('--pen')`), 'var(--pen-4)');

 console.log('\n--- the picker ---');
 A.$('meEdit').onclick();
 await wait(50);
 const dots=A.w.document.querySelectorAll('.penpick__dot');
 ck('offers every pen', dots.length, A.ev('PENS.length'));
 dots[1].onclick();
 ck('picking one takes effect', A.ev(`room.players.find(p=>p.id===me.id).pen`), 1);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
