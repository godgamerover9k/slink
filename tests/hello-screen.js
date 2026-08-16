/* The hello screen: a screen of its own, offering the way back rather than
   taking it for you. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
const shared=new Map();
function mk(priv){priv=priv||new Map();
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={async get(k,sh){const m=sh?shared:priv;return m.has(k)?{key:k,value:m.get(k)}:null},
    async set(k,v,sh){(sh?shared:priv).set(k,v);return{key:k,value:v}},
    async list(){return{keys:[]}},async delete(){return{}}};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  w.SVGElement.prototype.setPointerCapture=function(){};
  w.SVGElement.prototype.getTotalLength=()=>100;
  w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
  w.confirm=()=>true; w.prompt=()=>null;}});
 return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i),priv};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 console.log('--- the screen itself ---');
 const A=mk(); await wait(500);
 ck('the name field just says your name',
    A.ev(`document.querySelector('label[for=nameIn]').textContent`), 'Your name');
 ck('the offline toggle is a row, not a stack',
    A.ev(`getComputedStyle(document.getElementById('optOffline').closest('label')).display`), 'flex');
 ck('the screen is opaque, with no board showing through',
    A.ev(`getComputedStyle(document.getElementById('veil')).backdropFilter||'none'`), 'none');

 console.log('\n--- nothing to go back to yet ---');
 ck('no offer of a previous puzzle', A.$('lastRoom').hidden, true);

 console.log('\n--- after playing one ---');
 A.$('rowsIn').value='5';A.$('colsIn').value='5';A.$('nameIn').value='mara';
 A.$('createBtn').click();
 for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
 const code=A.ev('room.code');
 await wait(1200);

 // same browser, opened again
 const B=mk(A.priv); await wait(900);
 ck('it does not drop you back in', B.ev('!!room'), false);
 ck('the hello screen is showing', B.$('veil').hidden, false);
 ck('and the way back is offered', B.$('lastRoom').hidden, false);
 ck('naming the puzzle', /Back to/.test(B.$('lastRoom').textContent) && B.$('lastRoom').textContent.includes(code), true);

 console.log('\n--- taking it ---');
 B.$('lastRoom').onclick();
 for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
 ck('you are back in the puzzle', B.ev('room && room.code'), code);
 ck('and the screen is out of the way', B.$('veil').hidden, true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
