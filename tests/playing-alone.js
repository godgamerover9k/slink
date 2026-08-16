const fs=require('fs');const {JSDOM}=require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
const shared=new Map();
function mk(){const priv=new Map();
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={async get(k,sh){const m=sh?shared:priv;return m.has(k)?{key:k,value:m.get(k)}:null},
    async set(k,v,sh){(sh?shared:priv).set(k,v);return{key:k,value:v}},
    async list(){return{keys:[]}},async delete(){return{}}};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  w.SVGElement.prototype.setPointerCapture=function(){};
  w.SVGElement.prototype.getTotalLength=()=>100;
  w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
  w.confirm=()=>true;}});
 return {ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i),w:dom.window};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 const A=mk(); await wait(400);
 A.$('rowsIn').value='5';A.$('colsIn').value='5';A.$('nameIn').value='alice';
 A.$('createBtn').click();
 for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
 const e=A.ev('engine.H(1,1)');
 A.ev(`setEdgeUser(${e},"1",false)`); A.ev('render()');
 ck('alone, a line is graphite', A.ev(`segEls[${e}].getAttribute('stroke')`), 'var(--graphite)');
 const code=A.ev('room.code');
 await wait(900);

 const B=mk(); await wait(400);
 B.$('nameIn').value='bob'; B.ev('switchTab(false)');
 B.$('codeIn').value=code; B.$('joinBtn').click();
 for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
 await wait(600); await A.ev('poll()'); await wait(400);
 A.ev('render()');
 ck('with someone else, pens come back',
    A.ev(`segEls[${e}].getAttribute('stroke')`)!=='var(--graphite)', true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
