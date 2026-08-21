/* Taking over a branch whose assumption you have already settled. */
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
const q=v=>JSON.stringify(v);
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 await wait(400);
 $('rowsIn').value='8';$('colsIn').value='8';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);

 // branch A assumes a line at X, and works on from there
 const X=ev('engine.H(2,2)');
 $('trialStart').click();
 const A=ev('trial.id');
 ev(`setEdgeUser(${X},"1",false)`);
 const workOne=ev('engine.V(4,4)'), workTwo=ev('engine.H(5,1)');
 ev(`setEdgeUser(${workOne},"1",false)`);
 ev(`setEdgeUser(${workTwo},"2",false)`);
 ev('switchBranch(null)');

 // branch B settles that same thing for its own reasons
 $('trialStart').click();
 const B=ev('trial.id');
 ev(`setEdgeUser(${ev('engine.H(0,0)')},"1",false)`);   // its own premise
 ev('render()');
 ck('nothing to adopt yet', $('trialAdopt').hidden, true);

 ev(`setEdgeUser(${X},"1",false)`);                     // settles A's assumption
 ev('render()');
 ck('now the offer appears', $('trialAdopt').hidden, false);
 ck('naming the branch it would take from', /Adopt/.test($('trialAdopt').textContent), true);

 console.log('--- taking it ---');
 $('trialAdopt').click();
 await wait(120);
 ck("its work came across", [ev(`room.edges[${workOne}]`), ev(`room.edges[${workTwo}]`)], ['1','2']);
 ck('the branch it came from is still there', ev(`branches.has(${q(A)})`), true);
 ck('with its own work intact', ev(`branches.get(${q(A)}).marks.e[${workOne}]`), '1');
 ck('and you are still on your own branch', ev('trial && trial.id'), B);
 ev('switchBranch(null)');
 ck("the master did not take the adopted marks", ev(`room.edges[${workOne}]`), '0');

 console.log('\n--- it stays adopted ---');
 // more work on the branch that was adopted
 ev(`switchBranch(${q(A)})`);
 const later=ev('engine.H(7,3)');
 ev(`setEdgeUser(${later},"1",false)`);
 ev(`switchBranch(${q(B)})`);
 ck('later work shows through without adopting again', ev(`room.edges[${later}]`), '1');
 ck('and it is not offered a second time',
    ev(`adoptable().some(n=>n.id===${q(A)})`), false);
 ev('render()');
 ck('the button is not still asking', $('trialAdopt').hidden, true);

 // and taking work back there takes it back here
 ev(`switchBranch(${q(A)})`);
 ev(`setEdgeUser(${later},"0",false)`);
 ev(`switchBranch(${q(B)})`);
 ck('taking it back there takes it back here too', ev(`room.edges[${later}]`), '0');

 console.log('\n--- adoption is permanent ---');
 // a copy of the puzzle written by someone who never saw the adoption
 const stale=ev(`(()=>{
   const copy=JSON.parse(JSON.stringify(room));
   for(const id in copy.tree) if(copy.tree[id].adopted) copy.tree[id].adopted=[];
   copy.now=now()+5000;
   for(const id in copy.tree) copy.tree[id].at=now()+5000;
   return JSON.stringify(copy);
 })()`);
 ev(`adopt(JSON.parse(${JSON.stringify(stale)}))`);
 ev('render()');
 ck('a later write without it does not undo it',
    ev(`(branches.get(${q(B)}).adopted||[]).includes(${q(A)})`), true);
 ev(`switchBranch(${q(B)})`);
 ck('and the work still shows through', ev(`room.edges[${workOne}]`), '1');

 console.log('\n--- what it will not adopt ---');
 $('trialStart').click();
 const C=ev('trial.id');
 ev(`setEdgeUser(${ev('engine.V(6,6)')},"1",false)`);
 $('trialStart').click();                                // a child of C
 ev(`setEdgeUser(${ev('engine.V(7,2)')},"1",false)`);
 ev(`switchBranch(${q(C)})`); ev('render()');
 // the button may be offering some other branch; what matters is that a
 // branch's own offshoot is never among them — it is already in the stack
 const kid=ev('[...branches.values()].find(n=>n.parent)&&[...branches.values()].filter(n=>n.parent)[0].id');
 ck('a branch is never offered its own offshoot',
    ev(`adoptable().some(n=>n.parent===trial.id)`), false);
 ck('nor anything it descends from',
    ev(`adoptable().some(n=>isAncestor(n.id, trial))`), false);
 void kid;
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
