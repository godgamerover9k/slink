/* Whose mark is whose, and what sits on top of what. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
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
  w.confirm=()=>true; w.prompt=()=>null;}});
 return {w:dom.window,ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const q=v=>JSON.stringify(v);
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const sync=async(A,B)=>{ await wait(700); await A.ev('poll()'); await B.ev('poll()');
  await wait(500); await A.ev('poll()'); await B.ev('poll()'); await wait(500); };
(async()=>{
 const A=mk(); await wait(400);
 A.$('rowsIn').value='7';A.$('colsIn').value='7';A.$('nameIn').value='alice';
 A.$('createBtn').click();
 for(let i=0;i<300&&!A.ev('room');i++)await wait(100);
 const code=A.ev('room.code');
 await wait(800);
 const B=mk(); await wait(300);
 B.$('nameIn').value='bob'; B.ev('switchTab(false)');
 B.$('codeIn').value=code; B.$('joinBtn').click();
 for(let i=0;i<200&&!B.ev('room');i++)await wait(100);
 await sync(A,B);

 console.log('--- an x is in the pen of whoever placed it ---');
 const xa=A.ev('engine.H(1,1)'), la=A.ev('engine.H(2,2)');
 A.ev(`setEdgeUser(${xa},"2",false)`);
 A.ev(`setEdgeUser(${la},"1",false)`);
 await sync(A,B);
 A.ev('render()'); B.ev('render()');
 const xCol=A.ev(`xEls[${xa}].children[0].getAttribute('stroke')`);
 const lCol=A.ev(`segEls[${la}].getAttribute('stroke')`);
 ck('the x is not plain black', xCol!=='var(--graphite)', true);
 ck('and matches the line from the same hand', xCol, lCol);
 ck("bob sees alice's x in her colour",
    B.ev(`xEls[${xa}].children[0].getAttribute('stroke')`), xCol);

 console.log('--- the same on a branch ---');
 A.$('trialStart').click();
 const xb=A.ev('engine.V(3,3)');
 A.ev(`setEdgeUser(${xb},"2",false)`);
 A.ev('switchBranch(null)');
 A.ev(`switchBranch(${q(A.ev('[...branches.keys()][0]'))})`);
 A.ev('render()');
 ck('an x on a branch keeps its colour after re-deriving',
    A.ev(`xEls[${xb}].children[0].getAttribute('stroke')`), xCol);
 A.ev('switchBranch(null)');

 console.log('\n--- colours stay when the others go ---');
 A.ev(`room.players.forEach(p=>{ if(p.id!==me.id) p.seen = now()-999999; }); render();`);
 ck('alice keeps her colour once bob is idle',
    A.ev(`segEls[${la}].getAttribute('stroke')`), lCol);

 console.log('\n--- dots sit under the lines ---');
 // find which group each element belongs to by looking at the classes inside
 const kids=A.ev(`[...document.getElementById('board').children].map(g=>
   g.firstChild ? (g.firstChild.getAttribute('class')||'') : '')`);
 const dotsAt=kids.findIndex(c=>/(^|\s)dot(\s|$)/.test(c));
 // segments live in two groups: the faint grid, then the drawn lines
 const ghostAt=kids.findIndex(c=>/(^|\s)seg(\s|$)/.test(c));
 const drawnAt=kids.map((c,i)=>/(^|\s)seg(\s|$)/.test(c)?i:-1).filter(i=>i>=0).pop();
 ck('the board has dots and both line layers', dotsAt>=0 && ghostAt>=0 && drawnAt>ghostAt, true);
 ck('dots sit above the faint grid', dotsAt > ghostAt, true);
 ck('and below the drawn lines', dotsAt < drawnAt, true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
