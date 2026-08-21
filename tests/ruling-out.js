/* Ruling out one half of a fork makes the other true, and everything worked
   out under it true with it. */
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

 const X=ev('engine.H(2,2)');
 $('trialStart').click();
 const bad=ev('trial.id');
 ev(`setEdgeUser(${X},"1",false)`);          // guess: a line here
 await wait(80);
 const good=ev('trial.twin');

 // work done on the other half, which should survive
 ev(`switchBranch(${q(good)})`);
 const workOne=ev('engine.V(5,5)'), workTwo=ev('engine.H(6,1)');
 ev(`setEdgeUser(${workOne},"1",false)`);
 ev(`setEdgeUser(${workTwo},"2",false)`);
 // and something on the half that will be ruled out, which should not
 ev(`switchBranch(${q(bad)})`);
 const doomed=ev('engine.V(1,6)');
 ev(`setEdgeUser(${doomed},"1",false)`);

 console.log('--- ruling out the guess ---');
 $('trialReject').click();
 await wait(150);
 ck('the broken half is gone', ev(`branches.has(${q(bad)})`), false);
 ck('and so is the other, having been taken as true', ev(`branches.has(${q(good)})`), false);
 ck('you are back on the puzzle', ev('!!trial'), false);
 ck('the opposite of the guess is now on the board', ev(`room.edges[${X}]`), '2');
 ck('with the work done under it', [ev(`room.edges[${workOne}]`), ev(`room.edges[${workTwo}]`)], ['1','2']);
 ck('but nothing from the half that broke', ev(`room.edges[${doomed}]`), '0');
 ck('and it says what happened', /taken as true/.test($('toast').textContent), true);

 console.log('\n--- either half works the same way ---');
 const Y=ev('engine.H(4,4)');
 $('trialStart').click();
 ev(`setEdgeUser(${Y},"1",false)`);
 await wait(80);
 const first=ev('trial.id'), second=ev('trial.twin');
 ev(`switchBranch(${q(second)})`);
 const alsoWork=ev('engine.V(7,2)');
 ev(`setEdgeUser(${alsoWork},"1",false)`);
 // rule out the second half this time
 $('trialReject').click();
 await wait(150);
 ck('the guess itself is taken as true', ev(`room.edges[${Y}]`), '1');
 ck('both halves are settled',
    [ev(`branches.has(${q(first)})`), ev(`branches.has(${q(second)})`)], [false,false]);
 ck('and the ruled-out half left nothing behind', ev(`room.edges[${alsoWork}]`), '0');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
