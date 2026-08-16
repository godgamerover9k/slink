/* A phone has no shift, ctrl or alt. The same marks must still be reachable,
   and nothing about the desktop controls may change. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
function mk(touch){
 const mem=new Map();
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
  w.matchMedia=q=>({matches:touch&&/coarse/.test(q),addListener(){},removeListener(){}});
  Object.defineProperty(w.navigator,'maxTouchPoints',{value:touch?5:0,configurable:true});
  w.SVGElement.prototype.setPointerCapture=function(){};
  w.SVGElement.prototype.getTotalLength=()=>100;
  w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
  w.confirm=()=>true; w.prompt=()=>null;}});
 return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const S=34,PAD=22;
function pin(P){const b=P.$('board');
 b.getBoundingClientRect=()=>{const v=b.getAttribute('viewBox').split(' ').map(Number);
   return{left:0,top:0,width:v[2],height:v[3]};};
 Object.defineProperty(b,'viewBox',{get(){const v=b.getAttribute('viewBox').split(' ').map(Number);
   return{baseVal:{x:v[0],y:v[1],width:v[2],height:v[3]}};},configurable:true});return b;}
const tap=(P,b,x,y,opt={})=>{
 for(const type of ['pointerdown','pointerup'])
   b.dispatchEvent(new P.w.PointerEvent(type,{clientX:x,clientY:y,bubbles:true,cancelable:true,
     pointerId:1,button:0,pointerType:'touch',...opt}));
};
const mode=(P,name)=>P.ev(`document.querySelector('.modebar__btn[data-mode="${name}"]').onclick()`);
(async()=>{
 console.log('--- on a phone ---');
 const P=mk(true); await wait(500);
 ck('the mode bar is offered', P.$('modebar').hidden, false);
 ck('and the page knows it is touched', P.ev(`document.body.classList.contains('touch')`), true);
 P.$('rowsIn').value='6';P.$('colsIn').value='6';P.$('nameIn').value='phone';
 P.$('createBtn').click();
 for(let i=0;i<300&&!P.ev('room');i++)await wait(100);
 const board=pin(P);

 const edge=P.ev('engine.H(1,1)');
 tap(P,board,PAD+1.5*S,PAD+1*S);
 ck('a tap draws a line', P.ev(`room.edges[${edge}]`), '1');

 mode(P,'x');
 const edge2=P.ev('engine.H(2,2)');
 tap(P,board,PAD+2.5*S,PAD+2*S);
 ck('the × button marks an ×', P.ev(`room.edges[${edge2}]`), '2');

 mode(P,'blue');
 tap(P,board,PAD+3.5*S,PAD+3.5*S);
 ck('the blue button fills a square', P.ev(`room.cells[${3*P.ev('engine.C')+3}]`), '1');

 mode(P,'yellow');
 tap(P,board,PAD+4.5*S,PAD+4.5*S);
 ck('and the yellow one fills it yellow', P.ev(`room.cells[${4*P.ev('engine.C')+4}]`), '2');

 mode(P,'move');
 const before=P.ev(`room.edges[${P.ev('engine.H(5,5)')}]`);
 tap(P,board,PAD+5.5*S,PAD+5*S);
 ck('move mode draws nothing', P.ev(`room.edges[${P.ev('engine.H(5,5)')}]`), before);
 mode(P,'draw');

 console.log('\n--- two fingers ---');
 const wide=P.ev('view.w');
 const two=(type,id,x,y)=>board.dispatchEvent(new P.w.PointerEvent(type,
   {clientX:x,clientY:y,bubbles:true,cancelable:true,pointerId:id,pointerType:'touch'}));
 two('pointerdown',1,100,100); two('pointerdown',2,200,200);
 two('pointermove',2,300,300);
 ck('spreading them zooms in', P.ev('view.w') < wide, true);
 two('pointerup',1,100,100); two('pointerup',2,300,300);
 const marks=P.ev(`[...room.edges].filter(c=>c!=="0").length`);
 two('pointerdown',1,120,120);
 two('pointerdown',2,220,220);
 two('pointerup',1,120,120); two('pointerup',2,220,220);
 ck('and a pinch leaves no marks behind',
    P.ev(`[...room.edges].filter(c=>c!=="0").length`), marks);

 console.log('\n--- on a desktop, nothing changes ---');
 const D=mk(false); await wait(500);
 ck('no mode bar', D.$('modebar').hidden, true);
 ck('and no touch class', D.ev(`document.body.classList.contains('touch')`), false);
 D.$('rowsIn').value='6';D.$('colsIn').value='6';D.$('nameIn').value='desk';
 D.$('createBtn').click();
 for(let i=0;i<300&&!D.ev('room');i++)await wait(100);
 const dboard=pin(D);
 const de=D.ev('engine.H(1,1)');
 dboard.dispatchEvent(new D.w.PointerEvent('pointerdown',{clientX:PAD+1.5*S,clientY:PAD+1*S,
   bubbles:true,cancelable:true,pointerId:1,button:0,shiftKey:true}));
 dboard.dispatchEvent(new D.w.PointerEvent('pointerup',{clientX:PAD+1.5*S,clientY:PAD+1*S,
   bubbles:true,pointerId:1,shiftKey:true}));
 ck('shift-click still marks an ×', D.ev(`room.edges[${de}]`), '2');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
