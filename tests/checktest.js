/* Check puzzle looks at the puzzle, not at whichever branch you are inside. */
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
(async()=>{
 await wait(400);
 $('rowsIn').value='6';$('colsIn').value='6';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);

 console.log('--- a wrong guess on a branch is not the puzzle being wrong ---');
 const wrong=ev(`(()=>{const s=solutionFor(); for(let i=0;i<engine.E;i++) if(s[i]!==ON) return i;})()`);
 $('trialStart').click();
 const br=ev('trial.id');
 ev(`setEdgeUser(${wrong},"1",false)`);       // a line the solution does not have
 $('check').click();
 await wait(120);
 ck('the puzzle itself is fine', /right/.test($('toast').textContent), true);
 ck('and it says which board it looked at', /On the puzzle/.test($('toast').textContent), true);
 ck('you are still on your branch afterwards', ev('trial && trial.id'), br);
 ck('your guess is still there', ev(`room.edges[${wrong}]`), '1');

 console.log('\n--- a mistake on the puzzle is reported ---');
 ev('switchBranch(null)');
 ev(`setEdgeUser(${wrong},"1",false)`);
 $('check').click();
 await wait(120);
 ck('the wrong segment is found', /wrong place/.test($('toast').textContent), true);
 ck('no prefix when you were already on the puzzle',
    /On the puzzle/.test($('toast').textContent), false);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
