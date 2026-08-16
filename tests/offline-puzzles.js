/* An offline puzzle stays on this machine: no code, nothing written anywhere
   shared, and it still plays. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
const shared=new Map();
function mk(){const priv=new Map();
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={async get(k,sh){const m=sh?shared:priv;return m.has(k)?{key:k,value:m.get(k)}:null},
    async set(k,v,sh){(sh?shared:priv).set(k,v);return{key:k,value:v}},
    async list(){return{keys:[...shared.keys()]}},async delete(){return{}}};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  w.SVGElement.prototype.setPointerCapture=function(){};
  w.SVGElement.prototype.getTotalLength=()=>100;
  w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
  w.confirm=()=>true; w.prompt=()=>null;}});
 return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 console.log('--- the hello page ---');
 const A=mk(); await wait(400);
 ck('greets you', /^Hello/.test(A.$('cardTitle').textContent), true);
 ck('and says what this is',
    /WESLINK/.test(A.ev(`document.getElementById('cardTitle').previousElementSibling.textContent`)), true);
 ck('with the offline choice on it', !!A.$('optOffline'), true);

 ck('sharing is on by default', A.$('optOffline').checked, false);
 A.$('optOffline').checked=true;
 A.$('optOffline').dispatchEvent(new A.w.Event('change',{bubbles:true}));
 await wait(60);
 ck('the wording stops promising other people',
    /share the code/.test(A.$('cardSub').textContent), false);
 ck('and says what offline means',
    /Nothing is shared|puzzle of your own/.test(A.$('cardSub').textContent), true);
 ck('the note at the bottom agrees',
    /leaves this browser/.test(A.$('shareNote').textContent), true);
 A.$('rowsIn').value='5';A.$('colsIn').value='5';A.$('nameIn').value='solo';
 A.$('createBtn').click();
 for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
 ck('a puzzle was made', !!A.ev('room'), true);
 ck('the store is on its own', A.ev('store.mode'), 'memory');
 ck('and knows it', A.ev('store.solo'), true);
 await wait(1000);
 const roomKeys=[...shared.keys()].filter(k=>k.startsWith('sl:room:'));
 ck('nothing was written to shared storage', roomKeys.length, 0);
 ck('no code is shown', A.ev(`document.getElementById('roomchip').hidden`), true);
 ck('and nothing told you to share one',
    /share the code/.test(A.$('toast').textContent), false);
 ck('it says the puzzle is yours',
    /just for you/.test(A.$('toast').textContent), true);

 console.log('\n--- it still plays ---');
 const e=A.ev('engine.H(1,1)');
 A.ev(`setEdgeUser(${e},"1",false)`);
 ck('lines can be drawn', A.ev(`room.edges[${e}]`), '1');
 A.$('trialStart').click();
 A.ev(`setEdgeUser(${A.ev('engine.V(2,2)')},"1",false)`);
 ck('branches work too', A.ev('!!trial'), true);
 A.ev('switchBranch(null)');

 console.log('\n--- sharing when it is not chosen ---');
 const B=mk(); await wait(400);
 B.$('rowsIn').value='5';B.$('colsIn').value='5';B.$('nameIn').value='pair';
 B.$('createBtn').click();
 for(let i=0;i<300&&!B.ev('room');i++)await wait(100);
 await wait(900);
 ck('this one is shared', B.ev('store.ok'), true);
 ck('and reaches storage',
    [...shared.keys()].some(k=>k==='sl:room:'+B.ev('room.code')), true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
