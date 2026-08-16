/* When something is broken, the message should say where. */
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
 w.confirm=()=>true; w.prompt=()=>null;}});
const {window}=dom;const ev=e=>window.eval(e);const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const msgs=()=>ev('JSON.stringify(findTrouble().msgs)');
(async()=>{
 await wait(400);
 $('rowsIn').value='7';$('colsIn').value='7';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);

 console.log('--- a clue with too many lines ---');
 // find a clue and overfill it
 const target=ev(`(()=>{
   for(let k=0;k<engine.NC;k++) if(room.clues[k]===1) return k;
   for(let k=0;k<engine.NC;k++) if(room.clues[k]>=0) return k;
 })()`);
 ev(`(()=>{ for(let j=0;j<4;j++) setEdgeUser(engine.cEdge[${target}*4+j],"1",false); })()`);
 const m=JSON.parse(msgs());
 console.log('   said:', m[0]);
 ck('something is reported', m.length>0, true);
 ck('and it names the square', /r\d+c\d+/.test(m.join(' ')), true);
 ck('and says what the clue was', /the \d+ at/.test(m.join(' ')), true);

 console.log('\n--- three lines at one dot ---');
 ev('[...Array(engine.E).keys()].forEach(i=>setEdgeUser(i,"0",false))');
 const dot=ev(`(()=>{
   let n=0; const at=[];
   for(let i=0;i<engine.E;i++){ if(engine.ea[i]===12||engine.eb[i]===12){ at.push(i); } }
   at.slice(0,3).forEach(i=>setEdgeUser(i,"1",false));
   return at.length;
 })()`);
 if(dot>=3){
   const d=JSON.parse(msgs());
   console.log('   said:', d.find(x=>/dot/.test(x)));
   ck('the dot is named', /by r\d+c\d+/.test(d.join(' ')), true);
 }

 console.log('\n--- a branch shows its reason when you are on it ---');
 ev('[...Array(engine.E).keys()].forEach(i=>setEdgeUser(i,"0",false))');
 $('trialStart').click();
 ev(`(()=>{ for(let j=0;j<4;j++) setEdgeUser(engine.cEdge[${target}*4+j],"1",false); })()`);
 ev('render()');
 ck('the panel says it is a contradiction', $('trialTag').textContent, 'CONTRADICTION');
 console.log('   panel:', $('trialCopy').textContent.slice(0,80));
 ck('and the reason names a square', /r\d+c\d+/.test($('trialCopy').textContent), true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
