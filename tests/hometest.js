/* Links must name the address people should use, whatever address the page
   itself was opened at, and the old address should send them onward. */
const { loadPage } = require('./pageload.js');
const {JSDOM}=require('jsdom');
const html=loadPage(__dirname);
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function page(url,onReplace){
 const mem=new Map();
 const dom=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  w.SVGElement.prototype.setPointerCapture=function(){};
  Object.defineProperty(w,'localStorage',{value:{getItem:()=>null,setItem(){},removeItem(){}}});
  // jsdom refuses to navigate, so watch the attempt instead
  w.__replaced=null;
  const realReplace=w.location.replace.bind(w.location);
  void realReplace;
  try{
    Object.defineProperty(w.location,'replace',{configurable:true,writable:true,
      value:u=>{ w.__replaced=u; if(onReplace)onReplace(u); }});
  }catch(e){}
  w.confirm=()=>true;}});
 return {w:dom.window,ev:e=>dom.window.eval(e)};
}
(async()=>{
 console.log('--- from the proper address ---');
 const a=page('https://weslither.link/'); await wait(500);
 ck('a link points at weslither.link',
    /^https:\/\/weslither\.link\/\?room=ABCD/.test(a.ev(`roomLink("ABCD")`)), true);

 console.log('\n--- from the old address ---');
 const b=page('https://weslither.link/');
 await wait(500);
 const sentTo=b.ev(`homeRedirectTarget("https://slitherlink-plot-room.onrender.com/?room=WXYZ")`);
 ck('the visitor is sent to the new address', /^https:\/\/weslither\.link\//.test(sentTo||''), true);
 ck('carrying the puzzle they asked for', /room=WXYZ/.test(sentTo||''), true);
 ck('and someone already on the new address is left alone',
    b.ev(`homeRedirectTarget("https://weslither.link/?room=WXYZ")`), null);
 ck('as is anyone running it at home',
    b.ev(`homeRedirectTarget("http://localhost:8080/?room=WXYZ")`), null);

 console.log('\n--- running it at home ---');
 const c=page('http://localhost:8080/'); await wait(500);
 ck('a local link stays local',
    /^http:\/\/localhost:8080\/\?room=ABCD/.test(c.ev(`roomLink("ABCD")`)), true);
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
