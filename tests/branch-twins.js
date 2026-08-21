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

 console.log('--- starting a branch starts its opposite ---');
 $('trialStart').click();
 ck('two branches exist straight away', ev('branches.size'), 2);
 ck('linked to each other', !!ev('trial.twin'), true);
 ck('with nothing assumed yet on either',
    [ev('trial.premise'), ev('branches.get(trial.twin).premise')], [null,null]);
 ck('and the list shows both', ev(`document.querySelectorAll('.tw--paired').length`), 2);

 console.log('\n--- deciding one decides the other ---');
 const A=ev('trial.id');
 const X=ev('engine.H(2,2)');
 ev(`setEdgeUser(${X},"1",false)`);
 await wait(80);
 const B=ev('trial.twin');
 ck('no third branch appeared', ev('branches.size'), 2);
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

 console.log('\n--- you can see they are a pair ---');
 ev('switchBranch(null)'); ev('render()');
 const paired=[...window.document.querySelectorAll('.tw--paired')];
 console.log('   branches:', ev(`JSON.stringify([...branches.values()].map(n=>[n.id.slice(-3),n.twin?n.twin.slice(-3):null,n.premise?n.premise.to:'-']))`));
 ck('both rows are marked as a pair', paired.length, 2);
 ck('one is drawn as the top of the bracket and one as the foot',
    [paired.filter(r=>r.classList.contains('tw--pairTop')).length,
     paired.filter(r=>r.classList.contains('tw--pairFoot')).length], [1,1]);
 ck('and no words are needed for it',
    paired.every(r=>!/either way/i.test(r.textContent)), true);

 console.log('\n--- taking the assumption back unmakes the pair ---');
 ev(`switchBranch(${q(A)})`);
 ev(`setEdgeUser(${X},"0",false)`);
 await wait(80);
 ck('the assumption is gone', ev('trial.premise'), null);
 ck('the twin went with it', ev(`branches.has(${q(B)})`), false);
 ck('no twin is left pointing anywhere', ev('trial.twin'), null);
 ck('the branch itself is still here', ev(`branches.has(${q(A)})`), true);
 ev(`setEdgeUser(${X},"1",false)`);
 await wait(80);
 ck('guessing again makes a fresh pair', !!ev('trial.twin'), true);
 ev(`switchBranch(${q(A)})`);
 $('trialDrop').click();
 await wait(100);

 console.log('\n--- the same square cannot be guessed twice ---');
 ev('switchBranch(null)');
 $('trialStart').click();
 ev(`setEdgeUser(${X},"1",false)`);
 await wait(80);
 const P=ev('trial.id');
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

 console.log('\n--- a guess cannot be swapped for another ---');
 ev('switchBranch(null)');
 $('trialStart').click();
 const S=ev('engine.V(2,7)');
 ev(`setEdgeUser(${S},"1",false)`);
 await wait(80);
 const swapMe=ev('trial.id'), swapTwin=ev('trial.twin');
 const before=ev('branches.size');
 ev(`setEdgeUser(${S},"2",false)`);
 await wait(80);
 ck('the assumption is unchanged', ev('trial.premise.to'), '1');
 ck('and says what to do', /Clear this branch/i.test($('toast').textContent), true);
 ck('no second pair was made', ev('trial.twin'), swapTwin);
 ck('no branches were added', ev('branches.size'), before);
 ev(`switchBranch(${q(swapMe)})`);
 $('trialDrop').click();
 await wait(100);

 console.log('\n--- and the same by pressing undo ---');
 ev('switchBranch(null)');
 $('trialStart').click();
 const U=ev('engine.H(4,2)');
 ev(`setEdgeUser(${U},"1",false)`);
 await wait(80);
 const undoTwin=ev('trial.twin');
 ck('a pair was made', !!undoTwin, true);
 $('undo').click();
 await wait(120);
 ck('undo clears the assumption', ev('trial && trial.premise'), null);
 ck('and does not leave the twin behind', ev(`branches.has(${q(undoTwin)})`), false);
 ck('nothing is left claiming a twin', ev('trial && trial.twin'), null);
 $('trialDrop').click();
 await wait(100);

 console.log('\n--- settling one settles both ---');
 // a fresh pair, and an unrelated one to check nothing else is caught up in it
 ev('switchBranch(null)');
 $('trialStart').click();
 ev(`setEdgeUser(${ev('engine.H(7,1)')},"1",false)`);
 await wait(80);
 const one=ev('trial.id'), oneTwin=ev('trial.twin');
 ev('switchBranch(null)');
 $('trialStart').click();
 ev(`setEdgeUser(${ev('engine.V(3,6)')},"1",false)`);
 await wait(80);
 const other=ev('trial.id'), otherTwin=ev('trial.twin');

 ev(`switchBranch(${q(one)})`);
 $('trialDrop').click();
 await wait(120);
 ck('the branch is gone', ev(`branches.has(${q(one)})`), false);
 ck('and so is its twin', ev(`branches.has(${q(oneTwin)})`), false);
 ck('the unrelated pair is untouched',
    [ev(`branches.has(${q(other)})`), ev(`branches.has(${q(otherTwin)})`)], [true,true]);

 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
