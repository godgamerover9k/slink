const fs=require('fs');const {JSDOM}=require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
const mem=new Map();
let dl=null, dlName=null, written=null, asked=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
 w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
 w.SVGElement.prototype.setPointerCapture=function(){};
 w.SVGElement.prototype.getTotalLength=()=>100;
 w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
 w.URL.createObjectURL=b=>{dl=b;return 'blob:x';}; w.URL.revokeObjectURL=()=>{};
 w.confirm=m=>{asked.push(m);return w.__answer;};
 w.__answer=true;
}});
const {window}=dom;const ev=e=>window.eval(e);const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
// capture the name a download is given
const origCreate=window.document.createElement.bind(window.document);
window.document.createElement=(t)=>{const el=origCreate(t); if(t==='a'){const c=el.click.bind(el); el.click=()=>{dlName=el.download;};} return el;};
(async()=>{
 await wait(300);
 $('rowsIn').value='5';$('colsIn').value='5';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);
 const e1=ev('engine.H(1,1)');
 ev(`setEdgeUser(${e1},"1",false)`); ev('render()');

 console.log('--- a sheet made here saves under a new name ---');
 $('exportBtn').click(); await wait(150);
 ck('no question asked', asked.length, 0);
 ck('named after the sheet', /^slitherlink-/.test(dlName||''), true);
 const text=await dl.text();

 console.log('--- a sheet opened from a file offers to update it ---');
 window.showOpenFilePicker=undefined;
 $('packIn').onchange({target:{files:[{name:'mypuzzle.json',text:async()=>text}],value:''}});
 await wait(900);
 ck('the sheet loaded', !!ev('room'), true);
 asked=[]; dlName=null;
 window.__answer=true;
 $('exportBtn').click(); await wait(200);
 ck('it asked', asked.length, 1);
 ck('the question names the file', /mypuzzle\.json/.test(asked[0]||''), true);
 ck('saying yes reuses the name', dlName, 'mypuzzle.json');

 console.log('--- saying no keeps a separate copy ---');
 asked=[]; dlName=null; window.__answer=false;
 $('exportBtn').click(); await wait(200);
 ck('asked again', asked.length, 1);
 ck('and used a fresh name', /^slitherlink-/.test(dlName||''), true);

 console.log('--- where the browser can write in place, it does ---');
 let wrote=null;
 window.showOpenFilePicker=async()=>[{
   getFile:async()=>({name:'handled.json',text:async()=>text}),
   createWritable:async()=>({write:async d=>{wrote=d;},close:async()=>{}})
 }];
 ev('clearBranches()');
 await $('importBtn').onclick();
 await wait(900);
 asked=[]; dlName=null; window.__answer=true;
 $('exportBtn').click(); await wait(250);
 ck('asked before overwriting', /handled\.json/.test(asked[0]||''), true);
 ck('wrote straight to the file', typeof wrote==='string', true);
 ck('no download was needed', dlName, null);
 ck('what it wrote is the sheet', JSON.parse(wrote).puzzles[0].progress.edges[e1], '1');
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
