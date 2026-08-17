/* A guess and its opposite are made together and settled together, and no two
   branches under one parent may guess at the same square. */
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

 console.log('--- one guess makes two branches ---');
 $('trialStart').click();
 const A=ev('trial.id');
 const X=ev('engine.H(2,2)');
 ev(`setEdgeUser(${X},"1",false)`);
 await wait(80);
 ck('a twin was made', !!ev('trial.twin'), true);
 const B=ev('trial.twin');
 ck('there are two branches', ev('branches.size'), 2);
 ck('each points at the other',
    [ev(`branches.get(${q(A)}).twin`), ev(`branches.get(${q(B)}).twin`)], [B,A]);
 ck('the twin assumes the opposite',
    ev(`branches.get(${q(B)}).premise.to`), '2');
 ck('about the same square',
    ev(`branches.get(${q(B)}).premise.idx`), X);
 ck('and it holds that mark',
    ev(`branches.get(${q(B)}).marks.e[${X}]`), '2');
 ev(`switchBranch(${q(B)})`);
 ck('opening the twin shows its assumption', ev(`room.edges[${X}]`), '2');
 ev(`switchBranch(${q(A)})`);
 ck('and the first still shows its own', ev(`room.edges[${X}]`), '1');

 console.log('\n--- the same square cannot be guessed twice ---');
 ev('switchBranch(null)');
 $('trialStart').click();
 ev(`setEdgeUser(${X},"1",false)`);
 await wait(60);
 ck('the same guess is refused', ev('trial.premise'), null);
 ck('and says why', /already guesses/i.test($('toast').textContent), true);
 ev(`setEdgeUser(${X},"2",false)`);
 await wait(60);
 ck('so is the opposite guess', ev('trial.premise'), null);
 const Y=ev('engine.V(5,5)');
 ev(`setEdgeUser(${Y},"1",false)`);
 await wait(80);
 ck('a different square is fine', ev('trial.premise && trial.premise.idx'), Y);
 const C=ev('trial.id');

 console.log('\n--- settling one settles both ---');
 ev(`switchBranch(${q(A)})`);
 $('trialDrop').click();
 await wait(120);
 ck('the branch is gone', ev(`branches.has(${q(A)})`), false);
 ck('and so is its twin', ev(`branches.has(${q(B)})`), false);
 ck('the unrelated pair is untouched', ev(`branches.has(${q(C)})`), true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
