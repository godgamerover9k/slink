/* Which build this is, so a stale copy can be told apart from a fresh one. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const fs=require('fs'), path=require('path');
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
 const page=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
 const inFile=(/<meta name="version" content="([^"]+)">/.exec(page)||[])[1];
 console.log('   this build:', inFile);
 ck('the page carries a version', !!inFile, true);
 ck('it looks like a date and a number', /^\d{4}-\d{2}-\d{2}\.\d+$/.test(inFile||''), true);
 ck('the program picked it up', ev('slinkVersion'), inFile);
 ck('and it can be read from the console', ev('window.slinkVersion'), inFile);

 $('creditsBtn').click();
 await wait(50);
 ck('the credits show it', $('versionText').textContent, inFile);
 ck('quietly, not as a headline',
    /^VERSION/.test($('versionText').parentElement.textContent.trim()), true);
 // and from the server, without opening anything
 const {spawn}=require('child_process');
 const srv=spawn('node',[path.join(__dirname,'..','server','slink-server.js'),
   '--port','8398','--page','public/index.html','--data','/tmp/ver.json','--noopen','--open'],
   {cwd:path.join(__dirname,'..')});
 await wait(2500);
 let served=null;
 try{ served=await (await fetch('http://127.0.0.1:8398/version')).text(); }catch(e){}
 srv.kill();
 ck('the server reports the same build', served, inFile);

 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
