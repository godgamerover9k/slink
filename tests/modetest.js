const fs=require('fs');const {JSDOM}=require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
const mem=new Map();
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
 w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
 w.SVGElement.prototype.setPointerCapture=function(){};
 w.SVGElement.prototype.getTotalLength=()=>100;
 w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
 w.confirm=()=>true;}});
const {window}=dom;const ev=e=>window.eval(e);const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const css=(sel,prop)=>ev(`getComputedStyle(document.querySelector('${sel}')).${prop}`);
(async()=>{
 await wait(300);
 $('rowsIn').value='5';$('colsIn').value='5';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);
 const C=ev('engine.C');
 const line=ev('engine.H(1,1)'), xd=ev('engine.V(2,2)');
 ev(`setEdgeUser(${line},"1",false)`);
 ev(`setEdgeUser(${xd},"2",false)`);
 ev('render()');

 console.log('--- standard mode is untouched ---');
 ck('x marks are visible', ev(`getComputedStyle(xEls[${xd}]).display`)!=='none', true);
 ck('a drawn line is normal weight', parseFloat(ev(`getComputedStyle(segEls[${line}]).strokeWidth`)), 5);
 ck('you can still put blue and yellow', (()=>{ev('queueCell(0,"1")');ev('queueCell(1,"2")');ev('render()');
   return ev('room.cells[0]')+ev('room.cells[1]');})(), '12');

 console.log('\n--- the other mode only changes what you see ---');
 $('optWeight').checked=true; $('optWeight').dispatchEvent(new window.Event('change',{bubbles:true}));
 await wait(100);
 ck('x marks disappear', ev(`getComputedStyle(xEls[${xd}]).display`), 'none');
 ck('a ruled-out edge draws nothing', ev(`getComputedStyle(segEls[${xd}]).opacity`), '0');
 ck('a drawn line is bold', parseFloat(ev(`getComputedStyle(segEls[${line}]).strokeWidth`)), 6);
 ck('an undecided edge is a thin ghost',
    parseFloat(ev(`getComputedStyle(segEls[${ev('engine.H(3,3)')}]).strokeWidth`)), 1.8);
 // and it must sit behind the drawn ones, not over them
 ck('undecided lines are in the lower layer',
    ev(`segEls[${ev('engine.H(3,3)')}].parentNode === gSegGhost`), true);
 ck('drawn lines are in the upper layer',
    ev(`segEls[${line}].parentNode === gSegDrawn`), true);
 ck('the two layers are ordered ghost-then-drawn',
    ev(`[...gSegGhost.parentNode.children].indexOf(gSegGhost) < [...gSegDrawn.parentNode.children].indexOf(gSegDrawn)`), true);
 ck('the marks themselves are unchanged', ev(`room.edges[${xd}]`), '2');
 ck('and colours still work the same way', ev('room.cells[0]')+ev('room.cells[1]'), '12');

 console.log('\n--- colours either side of a line must differ ---');
 ev('[...Array(engine.NC).keys()].forEach(k=>queueCell(k,"0"))');
 const a=1*C+1, b=a+C;                       // vertically adjacent cells
 ev(`queueCell(${a},"1")`); ev(`queueCell(${b},"1")`);
 ev(`setEdgeUser(${ev(`engine.H(2,1)`)},"1",false)`);   // a line between them
 ev('render()');
 let t=ev('JSON.stringify(findTrouble().msgs)');
 const parityRow=/same colour on both sides|no line between them|disagrees with the lines|forced/;
 ck('same colour across a line is caught', parityRow.test(t), true);
 ev(`queueCell(${b},"2")`); ev('render()');
 t=ev('JSON.stringify(findTrouble().msgs)');
 ck('opposite colours across a line are fine', parityRow.test(t), false);

 console.log('\n--- and must match where a line is ruled out ---');
 ev(`setEdgeUser(${ev(`engine.H(2,1)`)},"2",false)`);   // no line between them now
 ev('render()');
 t=ev('JSON.stringify(findTrouble().msgs)');
 ck('differing colours with no line is caught', parityRow.test(t), true);
 ev(`queueCell(${b},"1")`); ev('render()');
 t=ev('JSON.stringify(findTrouble().msgs)');
 ck('matching colours with no line are fine', parityRow.test(t), false);

 console.log('\n--- an undecided edge asserts nothing ---');
 ev(`setEdgeUser(${ev(`engine.H(2,1)`)},"0",false)`);
 ev(`queueCell(${b},"2")`); ev('render()');
 t=ev('JSON.stringify(findTrouble().msgs)');
 ck('no complaint either way', parityRow.test(t), false);
 console.log('\n--- claims about two squares ---');
 ev('[...Array(engine.NC).keys()].forEach(k=>queueCell(k,"0"))');
 ev(`setEdgeUser(${ev('engine.H(2,1)')},"0",false)`);
 const p1=1*C+1, p2=3*C+3;
 ev(`setRelUser("${[p1,p2].sort((x,y)=>x-y).join(':')}","d")`); ev('render()');
 ck('a claim is stored', ev(`Object.keys(room.rels).length`), 1);
 ck('and drawn', ev(`document.querySelectorAll('.rel').length`)>=1, true);
 ck('an isolated claim contradicts nothing',
    /forced/.test(ev('JSON.stringify(findTrouble().msgs)')), false);
 // pin both squares to the same side; "opposite" then cannot hold
 ev(`queueCell(${p1},"1")`); ev(`queueCell(${p2},"1")`); ev('render()');
 ck('a claim that fights the colours is caught',
    /forced the same|disagrees/.test(ev('JSON.stringify(findTrouble().msgs)')), true);
 ev(`setRelUser("${[p1,p2].sort((x,y)=>x-y).join(':')}","0")`); ev('render()');
 ck('removing the claim settles it',
    /forced/.test(ev('JSON.stringify(findTrouble().msgs)')), false);
 ck('claims survive a branch', (()=>{
   $('trialStart').click();
   ev(`setRelUser("0:1","s")`);
   const inBranch=ev(`room.rels["0:1"]`);
   ev('switchBranch(null)');
   const onSheet=ev(`room.rels["0:1"]||"gone"`);
   return inBranch+"/"+onSheet;
 })(), 's/gone');

 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
