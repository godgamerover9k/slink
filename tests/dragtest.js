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

const html=fs.readFileSync(pagePath(),'utf8');
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
 return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const q=v=>JSON.stringify(v);
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 const A=mk(); await wait(400);
 A.$('rowsIn').value='5';A.$('colsIn').value='5';A.$('nameIn').value='alice';
 A.$('createBtn').click();
 for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
 // three branches off the sheet, plus one nested under the first
 const ids=[];
 for(let i=0;i<3;i++){
   A.ev('switchBranch(null)');
   A.$('trialStart').click();
   A.ev(`setEdgeUser(${A.ev(`engine.H(${i},0)`)},"1",false)`);
   ids.push(A.ev('trial.id'));
 }
 A.ev(`switchBranch(${q(ids[0])})`);
 A.$('trialStart').click();
 const kid=A.ev('trial.id');
 A.ev('switchBranch(null)'); A.ev('render()');
 const order=()=>A.ev('JSON.stringify(trunk.children)');
 ck('three branches on the sheet, in the order made', JSON.parse(order()), ids);

 console.log('\n--- dragging within the same parent ---');
 ck('last dragged to the front', (()=>{
   A.ev(`reorderBranch(${q(ids[2])},${q(ids[0])},false)`);
   return JSON.parse(order());
 })(), [ids[2],ids[0],ids[1]]);
 ck('and dropped after another', (()=>{
   A.ev(`reorderBranch(${q(ids[2])},${q(ids[1])},true)`);
   return JSON.parse(order());
 })(), [ids[0],ids[1],ids[2]]);

 console.log('\n--- what must not move ---');
 ck('a branch cannot leave its parent',
    A.ev(`reorderBranch(${q(kid)},${q(ids[1])},true)`), false);
 ck('the nested one is untouched',
    A.ev(`JSON.stringify(branches.get(${q(ids[0])}).children)`), q([kid]).replace(/"/g,'"'));
 ck('dropping onto itself does nothing',
    A.ev(`reorderBranch(${q(ids[0])},${q(ids[0])},true)`), false);

 console.log('\n--- the order is shared and survives a reload ---');
 A.ev(`reorderBranch(${q(ids[2])},${q(ids[0])},false)`);
 const want=JSON.parse(order());
 await wait(900);
 const B=mk(); await wait(400);
 B.$('nameIn').value='bob'; B.ev('switchTab(false)');
 B.$('codeIn').value=A.ev('room.code'); B.$('joinBtn').click();
 for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
 await wait(500); B.ev('render()');
 ck('bob sees the same order', JSON.parse(B.ev('JSON.stringify(trunk.children)')), want);

 console.log('\n--- rows are draggable, the sheet row is not ---');
 const rows=[...A.w.document.querySelectorAll('.tw')];
 ck('the sheet row cannot be dragged', rows[0].draggable, false);
 ck('branch rows can', rows[1].draggable, true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
