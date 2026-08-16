const fs=require('fs');const {JSDOM}=require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
const shared=new Map();
function mk(store){const priv=new Map();
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={async get(k,sh){const m=sh?shared:priv;return m.has(k)?{key:k,value:m.get(k)}:null},
    async set(k,v,sh){(sh?shared:priv).set(k,v);return{key:k,value:v}},
    async list(){return{keys:[]}},async delete(){return{}}};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  w.SVGElement.prototype.setPointerCapture=function(){};
  w.SVGElement.prototype.getTotalLength=()=>100;
  w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
  Object.defineProperty(w,'localStorage',{value:{
    getItem:k=>store.has(k)?store.get(k):null,
    setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});
  w.confirm=()=>true;}});
 return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 const mem=new Map();
 const A=mk(mem); await wait(400);
 const legend=()=>A.ev(`getComputedStyle(document.querySelector('.legend')).display`);
 console.log('--- hiding the controls ---');
 ck('shown to begin with', legend()!=='none', true);
 ck('the button says hide', A.$('ctrlToggle').textContent, 'hide');
 A.$('ctrlToggle').click();
 ck('now hidden', legend(), 'none');
 ck('and offers to show', A.$('ctrlToggle').textContent, 'show');
 A.$('ctrlToggle').click();
 ck('shown again', legend()!=='none', true);
 A.$('ctrlToggle').click();
 ck('the choice is remembered', mem.get('sl:controls'), 'shut');
 const B=mk(mem); await wait(400);
 ck('and honoured next time',
    B.ev(`getComputedStyle(document.querySelector('.legend')).display`), 'none');

 console.log('\n--- absent-lines mode keeps whose pen is whose ---');
 const C=mk(new Map()); await wait(400);
 C.$('rowsIn').value='5';C.$('colsIn').value='5';C.$('nameIn').value='alice';
 C.$('createBtn').click();
 for(let i=0;i<300&&!C.ev('room');i++)await wait(100);
 const code=C.ev('room.code');
 const ea=C.ev('engine.H(1,1)');
 C.ev(`setEdgeUser(${ea},"1",false)`);
 await wait(900);
 const D=mk(new Map()); await wait(300);
 D.$('nameIn').value='bob'; D.ev('switchTab(false)');
 D.$('codeIn').value=code; D.$('joinBtn').click();
 for(let i=0;i<200&&!D.ev('room');i++)await wait(100);
 const eb=D.ev('engine.V(2,2)');
 D.ev(`setEdgeUser(${eb},"1",false)`);
 const und=D.ev('engine.H(3,3)'), xd=D.ev('engine.V(0,0)');
 D.ev(`setEdgeUser(${xd},"2",false)`);
 await wait(900); await C.ev('poll()'); await wait(500); C.ev('render()');

 // jsdom cannot resolve css variables, so compare what the app sets and
 // confirm the mode's grey rule cannot reach a drawn line
 const plainA=C.ev(`segEls[${ea}].getAttribute('stroke')`);
 const plainB=C.ev(`segEls[${eb}].getAttribute('stroke')`);
 C.$('optWeight').checked=true;
 C.$('optWeight').dispatchEvent(new C.w.Event('change',{bubbles:true}));
 await wait(120);
 const wA=C.ev(`segEls[${ea}].getAttribute('stroke')`);
 const wB=C.ev(`segEls[${eb}].getAttribute('stroke')`);
 console.log(`   alice: ${plainA} -> ${wA}`);
 console.log(`   bob:   ${plainB} -> ${wB}`);
 ck("alice's line keeps her colour", wA, plainA);
 ck("bob's line keeps his", wB, plainB);
 ck('the two are told apart', wA!==wB, true);
 ck('neither is the flat grey', wA!=='var(--rule)'&&wB!=='var(--rule)', true);
 const css=require('fs').readFileSync(require('path').join(__dirname,'..','public','styles.css'),'utf8');
 ck('the grey rule only targets undecided segments',
    /body\.weighted \.seg:not\(\.on\)\{stroke:var\(--ghost\)/.test(css), true);
 ck('and no rule paints every segment', /body\.weighted \.seg\{[^}]*stroke:/.test(css), false);
 ck('a ruled-out one is invisible', C.ev(`getComputedStyle(segEls[${xd}]).opacity`), '0');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
