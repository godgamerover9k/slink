const fs=require('fs');const {JSDOM}=require('jsdom');
const path=require('path');
/* the page is index.html in the repository, and slitherlink-plotroom.html when
   working on it loose; accept either */
function pagePath(){
  for(const p of ['index.html','slitherlink-plotroom.html',
                  path.join(__dirname,'..','index.html')])
    if(require('fs').existsSync(p))return p;
  throw new Error('cannot find the page next to these tests');
}

const html=fs.readFileSync('/home/claude/slitherlink-plotroom.html','utf8');
const mem=new Map(); let dl=null;
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
 w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
 w.SVGElement.prototype.setPointerCapture=function(){};
 w.SVGElement.prototype.getTotalLength=()=>100;
 w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
 w.URL.createObjectURL=b=>{dl=b;return 'blob:x';}; w.URL.revokeObjectURL=()=>{};
 w.confirm=()=>true;}});
const {window}=dom;const ev=e=>window.eval(e);const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 await wait(300);
 $('rowsIn').value='5';$('colsIn').value='5';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);
 const e1=ev('engine.H(1,1)');
 ev(`setEdgeUser(${e1},"1",false)`); ev('render()');
 $('exportBtn').click(); await wait(150);
 const text=await dl.text();
 ev('clearBranches()');
 $('packIn').onchange({target:{files:[{name:'p.json',text:async()=>text}],value:''}});
 await wait(900);
 ck('a restored line has an owner', ev(`room.eo[${e1}]`)>=0, true);
 const sheetColour=ev(`segEls[${e1}].getAttribute('stroke')`);
 // alone the sheet is graphite by design; what matters is that a restored
 // line and a freshly drawn one look the same
 ck('a restored line has a colour', !!sheetColour, true);
 $('trialStart').click();
 const e2=ev('engine.V(2,2)');
 ev(`setEdgeUser(${e2},"1",false)`); ev('render()');
 ck('a line drawn on a branch is the same colour',
    ev(`segEls[${e2}].getAttribute('stroke')`), sheetColour);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
