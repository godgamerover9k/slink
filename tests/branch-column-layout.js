const fs=require('fs');const {JSDOM}=require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
function mk(width){
 const mem=new Map();
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  w.SVGElement.prototype.setPointerCapture=function(){};
  Object.defineProperty(w,'innerWidth',{value:width,writable:true,configurable:true});
 }});
 return dom.window;
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 const wide=mk(1600); await wait(500);
 ck('wide: branches sit in their own column',
    wide.document.getElementById('trialBlock').parentElement.id, 'branchcol');
 // and that column is the last thing in the row, to the right of the tools
 const kids=[...wide.document.querySelector('.stage').children].map(e=>e.id||e.className);
 ck('wide: the branch column is furthest right', kids[kids.length-1], 'branchcol');
 ck('wide: the tools panel sits before it', kids[kids.length-2], 'panel');
 ck('wide: that column is shown', wide.document.getElementById('branchcol').hidden, false);
 ck('the tools panel is still there',
    !!wide.document.querySelector('.panel .block'), true);

 const narrow=mk(1000); await wait(500);
 ck('narrow: branches fold back into the side panel',
    narrow.document.getElementById('trialBlock').parentElement.className, 'panel');
 ck('narrow: the extra column is hidden',
    narrow.document.getElementById('branchcol').hidden, true);

 // and it follows the window
 narrow.innerWidth=1600;
 narrow.dispatchEvent(new narrow.Event('resize'));
 await wait(100);
 ck('resizing wider moves it out',
    narrow.document.getElementById('trialBlock').parentElement.id, 'branchcol');
 narrow.innerWidth=900;
 narrow.dispatchEvent(new narrow.Event('resize'));
 await wait(100);
 ck('resizing narrower brings it back',
    narrow.document.getElementById('trialBlock').parentElement.className, 'panel');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
