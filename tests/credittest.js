const fs=require('fs');const {JSDOM}=require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
const mem=new Map();
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
 w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
 w.SVGElement.prototype.setPointerCapture=function(){};}});
const {window}=dom;const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
(async()=>{
 await wait(400);
 ck('hidden until asked for', $('credits').hidden, true);
 $('creditsBtn').click();
 ck('opens', $('credits').hidden, false);
 const links=[...$('credits').querySelectorAll('a')].map(a=>a.href);
 ck('links to krazydad', links.some(h=>/krazydad\.com/.test(h)), true);
 ck('links to jonathanolson', links.some(h=>/jonathanolson\.net\/slitherlink/.test(h)), true);
 ck('links open safely', [...$('credits').querySelectorAll('a')].every(a=>
    a.target==='_blank' && /noopener/.test(a.rel)), true);
 ck('credits Nikoli too', /Nikoli/.test($('credits').textContent), true);
 $('creditsClose').click();
 ck('closes', $('credits').hidden, true);
 $('creditsBtn').click();
 window.document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 ck('escape closes it', $('credits').hidden, true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
