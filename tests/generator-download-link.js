/* The page should link the binary when the host has it, and stay quiet when
   it doesn't. */
const http=require('http');const fs=require('fs');const {JSDOM}=require('jsdom');
const { loadPage } = require('./pageload.js');
const html = loadPage(__dirname);
let serveExe=true;
const srv=http.createServer((req,res)=>{
  if(req.url.startsWith('/kv/')){res.writeHead(404);return res.end();}
  if(/download\/slink-gen-/.test(req.url)){
    if(!serveExe){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Length':'5'});return res.end(req.method==='HEAD'?'':'MZfoo');
  }
  res.writeHead(200,{'Content-Type':'text/html'});res.end(html);
}).listen(8281);
const base='http://127.0.0.1:8281/';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
function page(ua){
  const dom=new JSDOM(html,{url:base,runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){
      // jsdom ignores its own userAgent option here, so set it directly
      Object.defineProperty(w.navigator,'userAgent',{value:ua,configurable:true});
      w.fetch=(u,o)=>fetch(new URL(u,base),o);
      w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
      w.SVGElement.prototype.setPointerCapture=function(){};
      Object.defineProperty(w,'localStorage',{value:{getItem:()=>null,setItem(){},removeItem(){}}});
    }});
  return {ev:e=>dom.window.eval(e),$:i=>dom.window.document.getElementById(i)};
}
(async()=>{
 const win=page('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
 await wait(1200);
 ck('windows gets the exe link', win.$('getExe').hidden, false);
 ck('pointing at the right file', win.$('getExe').getAttribute('href'), 'download/slink-gen-win-x64.exe');
 ck('and it says which', /win-x64/.test(win.$('getExe').textContent), true);
 ck('the script download is still offered', win.$('getGen').hidden, false);

 const mac=page('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
 await wait(1200);
 ck('a mac is offered a mac build', /download\/slink-gen-macos/.test(mac.$('getExe').getAttribute('href')||''), true);

 serveExe=false;
 const none=page('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
 await wait(1200);
 ck('no binary published, no link', none.$('getExe').hidden, true);
 console.log(`\n${pass} passed, ${fail} failed`);
 srv.close(); process.exit(fail?1:0);
})();
setTimeout(()=>{srv.close();process.exit(1);},60000);
