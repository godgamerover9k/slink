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
(async()=>{
 await wait(300);
 $('rowsIn').value='5';$('colsIn').value='5';$('nameIn').value='alice';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);

 console.log('--- the stray corner mark is gone ---');
 ck('no decorative corner rule', /\.sheet::after/.test(html), false);

 console.log('\n--- the list is of players ---');
 ck('heading says Players', /Players/.test($('onlinecount').parentElement.textContent), true);
 ck('and not Pens', /Pens/.test($('onlinecount').parentElement.textContent), false);

 console.log('\n--- someone away keeps their colour ---');
 // add a second player who has not been seen for a while
 ev(`room.players.push({id:"someone-else",name:"bob",seen:now()-999999,ops:0}); render();`);
 const pens=[...window.document.querySelectorAll('.pen')];
 const idle=pens.find(e=>e.className.includes('pen--idle'));
 ck('the away player is marked idle', !!idle, true);
 ck('their pen still has a colour',
    !!idle.style.getPropertyValue('--pen'), true);
 ck('the barrel is not greyed out',
    ev(`getComputedStyle(document.querySelector('.pen--idle .pen__barrel')).filter`), 'none');
 ck('but the name is dimmed',
    ev(`getComputedStyle(document.querySelector('.pen--idle .pen__name')).color`)
    !== ev(`getComputedStyle(document.querySelector('.pen:not(.pen--idle) .pen__name')).color`), true);

 console.log('\n--- the AI disclaimer ---');
 ck('the header says so', /AI-made/.test($('creditsBtn').textContent), true);
 $('creditsBtn').click();
 const txt=$('credits').textContent;
 ck('credits explain it was written by an AI', /written by Claude, an AI/.test(txt), true);
 ck('and warns it may be rough', /rough\s+edge/.test(txt), true);
 // the disclaimer is for players; maintenance advice does not belong in it
 ck('without telling players to go checking things', /check anything/.test(txt), false);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
