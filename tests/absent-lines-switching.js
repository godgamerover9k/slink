/* Switching the absent-lines view must not show anything that is not there. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
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
 await wait(400);
 $('rowsIn').value='6';$('colsIn').value='6';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);
 // draw a few, then rub one out so it has a stale stroke
 const a=ev('engine.H(1,1)'), b=ev('engine.H(2,2)');
 ev(`setEdgeUser(${a},"1",false)`);
 ev(`setEdgeUser(${b},"1",false)`);
 ev(`setEdgeUser(${b},"0",false)`);
 ev('render()');
 ck('the rubbed-out line is not black underneath',
    ev(`segEls[${b}].getAttribute('stroke')`), 'var(--ghost)');

 $('optWeight').checked=true;
 $('optWeight').dispatchEvent(new window.Event('change',{bubbles:true}));
 await wait(30);
 ck('switching in stops the fade', ev(`document.body.classList.contains('noFade')`), true);
 await wait(120);
 ck('and lets it fade again afterwards', ev(`document.body.classList.contains('noFade')`), false);

 $('optWeight').checked=false;
 $('optWeight').dispatchEvent(new window.Event('change',{bubbles:true}));
 await wait(10);
 const strokes=ev(`[...Array(engine.E).keys()]
   .filter(i=>room.edges[i]!=="1")
   .map(i=>segEls[i].getAttribute('stroke'))`);
 ck('no undecided line is left holding a pen colour',
    strokes.every(s=>s==='var(--ghost)'), true);
 ck('the drawn one still has its own colour',
    ev(`segEls[${a}].getAttribute('stroke')`)!=='var(--ghost)', true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
