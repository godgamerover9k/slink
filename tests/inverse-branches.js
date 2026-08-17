/* A guess and its opposite: listed together, and whatever they agree on is
   true whichever way the guess goes. */
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
 const both=ev('engine.V(5,5)'), onlyOne=ev('engine.H(6,6)'), disagree=ev('engine.V(1,3)');

 // an unrelated branch, so the pair is not adjacent by accident
 ev('switchBranch(null)');
 $('trialStart').click();
 ev(`setEdgeUser(${ev('engine.H(0,0)')},"1",false)`);
 await wait(80);
 const middle=ev('trial.id');

 // one guess: the twin is made for us
 ev('switchBranch(null)');
 $('trialStart').click();
 const yes=ev('trial.id');
 ev(`setEdgeUser(${X},"1",false)`);
 await wait(80);
 const no=ev('trial.twin');
 ev(`setEdgeUser(${both},"1",false)`);            // this branch concludes it
 ev(`setEdgeUser(${onlyOne},"2",false)`);         // only this branch says so
 ev(`setEdgeUser(${disagree},"1",false)`);

 ev(`switchBranch(${q(no)})`);
 ev(`setEdgeUser(${both},"1",false)`);            // the twin agrees
 ev(`setEdgeUser(${disagree},"2",false)`);        // and disagrees here
 ev('render()');

 console.log('--- they are listed together ---');
 const order=ev(`JSON.stringify(trunk.children)`);
 const ids=JSON.parse(order);
 ck('the pair is side by side',
    Math.abs(ids.indexOf(yes)-ids.indexOf(no)), 1);
 ck('with the other branch elsewhere', ids.includes(middle), true);

 console.log('\n--- what they agree on ---');
 ev(`switchBranch(${q(no)})`); ev('render()');
 ck('the button is offered', $('trialAgreed').hidden, false);
 ck('counting only the agreements', /1 mark/.test($('trialAgreed').textContent), true);

 $('trialAgreed').click();
 await wait(120);
 ck('you end up on the parent', ev('!!trial'), false);
 ck('what both agreed is now on the puzzle', ev(`room.edges[${both}]`), '1');
 ck('what only one said is not', ev(`room.edges[${onlyOne}]`), '0');
 ck('and what they disagreed on is not', ev(`room.edges[${disagree}]`), '0');
 ck('the assumption itself did not come across', ev(`room.edges[${X}]`), '0');
 ck('both branches are still there',
    [ev(`branches.has(${q(yes)})`), ev(`branches.has(${q(no)})`)], [true,true]);

 console.log('\n--- a branch with no opposite ---');
 ev(`switchBranch(${q(middle)})`); ev('render()');
 ck('nothing is offered', $('trialAgreed').hidden, true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
