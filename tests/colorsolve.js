/* A puzzle finished by colouring the two sides, with no lines drawn. */
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
 w.confirm=()=>true;}});
const {window}=dom;const ev=e=>window.eval(e);const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 await wait(400);
 $('rowsIn').value='5';$('colsIn').value='5';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);

 // work out the true sides from the solution, then colour every square
 /* Which side each square is on, counted by parity: walking in from beyond the
    left edge, every line crossed swaps you from outside to inside. A flood fill
    gets this wrong when the loop touches the border. */
 const paint=ev(`(()=>{
   const s=solutionFor(), out=[];
   for(let r=0;r<engine.R;r++){
     let inside=false;
     for(let c=0;c<engine.C;c++){
       if(s[engine.V(r,c)]===ON)inside=!inside;
       out.push(inside?0:1);          // 1 means outside
     }
   }
   return JSON.stringify(out);
 })()`);
 const outside=JSON.parse(paint);

 ck('not solved to begin with', ev('!!room.solvedAt'), false);
 outside.forEach((isOut,k)=>ev(`queueCell(${k},"${isOut?1:2}")`));
 ev('render()');
 ck('colouring every square finishes it', ev('!!room.solvedAt'), true);
 ck('with no lines drawn', ev(`[...room.edges].filter(c=>c==="1").length`), 0);
 ck('and it says so', /complete/.test($('statline').textContent), true);

 console.log('\n--- a wrong colouring does not count ---');
 ev('room.solvedAt=0');
 const k0=0;
 ev(`queueCell(${k0},"${outside[0]?2:1}")`);   // flip one square
 ev('render()');
 ck('one square out of place is not a solution', ev('!!room.solvedAt'), false);

 console.log('\n--- a half-coloured board is not a solution either ---');
 ev('[...Array(engine.NC).keys()].forEach(k=>queueCell(k,"0"))');
 outside.slice(0,3).forEach((isOut,k)=>ev(`queueCell(${k},"${isOut?1:2}")`));
 ev('render()');
 ck('still unfinished', ev('!!room.solvedAt'), false);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
