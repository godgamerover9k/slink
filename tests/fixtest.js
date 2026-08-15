const fs=require('fs');const {JSDOM}=require('jsdom');
const path=require('path');
/* the page is index.html in the repository, and slitherlink-plotroom.html when
   working on it loose; accept either */
function pagePath(){
  for(const p of ['index.html','slitherlink-plotroom.html',
                  path.join(__dirname,'..','index.html')])
    if(require('fs').existsSync(p))return p;
  throw new Error('cannot find the page next to these tests');
}

const html=fs.readFileSync(pagePath(),'utf8');
const mem=new Map();
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.storage={async get(k){return mem.has(k)?{key:k,value:mem.get(k)}:null},async set(k,v){mem.set(k,v);return{key:k,value:v}},async list(){return{keys:[]}},async delete(){return{}}};
 w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
 w.SVGElement.prototype.setPointerCapture=function(){};
 w.SVGElement.prototype.getTotalLength=()=>100;
 w.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
 w.confirm=()=>true; w.__prompt='Left side theory'; w.prompt=()=>w.__prompt;}});
const {window}=dom;const ev=e=>window.eval(e);const $=i=>window.document.getElementById(i);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const S=34,PAD=22;
function pin(){const b=$('board');b.getBoundingClientRect=()=>{const v=b.getAttribute('viewBox').split(' ').map(Number);return{left:0,top:0,width:v[2],height:v[3]};};
 Object.defineProperty(b,'viewBox',{get(){const v=b.getAttribute('viewBox').split(' ').map(Number);return{baseVal:{x:v[0],y:v[1],width:v[2],height:v[3]}};},configurable:true});return b;}
const down=(b,x,y,o={})=>b.dispatchEvent(new window.PointerEvent('pointerdown',{clientX:x,clientY:y,bubbles:true,cancelable:true,pointerId:1,button:0,...o}));
const move=(b,x,y,o={})=>b.dispatchEvent(new window.PointerEvent('pointermove',{clientX:x,clientY:y,bubbles:true,pointerId:1,...o}));
const up=(b,x,y,o={})=>b.dispatchEvent(new window.PointerEvent('pointerup',{clientX:x,clientY:y,bubbles:true,pointerId:1,...o}));
const key=(t,k)=>window.dispatchEvent(new window.KeyboardEvent(t,{key:k,bubbles:true}));
(async()=>{
 await wait(300);
 $('rowsIn').value='6';$('colsIn').value='6';$('nameIn').value='t';
 $('createBtn').click();
 for(let i=0;i<300&&!ev('room');i++)await wait(100);
 const board=pin(), C=ev('engine.C');

 console.log('--- clear all lines ---');
 ev(`setEdgeUser(${ev('engine.H(1,1)')},"1",false)`);
 ev(`setEdgeUser(${ev('engine.H(2,2)')},"1",false)`);
 ev(`setEdgeUser(${ev('engine.V(1,1)')},"2",false)`);
 ev('queueDiag(0,"1"); queueDiag(3,"2"); render()');
 ck('two diagonals drawn', ev(`[...room.diag].filter(c=>c!=="0").length`), 2);
 $('clearlines').click();
 ck('lines gone', ev(`[...room.edges].filter(c=>c==="1").length`), 0);
 ck('diagonals go with them', ev(`[...room.diag].filter(c=>c!=="0").length`), 0);
 ck('x marks left alone', ev(`[...room.edges].filter(c=>c==="2").length`), 1);
 ck('it says what it cleared', /line|diagonal/.test($('toast').textContent), true);

 console.log('\n--- the pen rack no longer counts edits ---');
 ck('no count element', ev(`document.querySelectorAll('.pen__count').length`), 0);

 console.log('\n--- the root is called Master ---');
 ck('label', ev(`document.querySelector('.tw__label').textContent`), 'Master');

 console.log('\n--- diagonals are corner-to-corner drags ---');
 ev('[...Array(engine.NC).keys()].forEach(k=>queueDiag(k,"0"))');
 key('keydown','d');
 // drag from the top-left dot of cell (1,1) to its bottom-right dot
 down(board, PAD+1*S, PAD+1*S);
 move(board, PAD+2*S-3, PAD+2*S+2);
 up(board, PAD+2*S-3, PAD+2*S+2);
 ck('a corner-to-corner drag draws one', ev(`room.diag[${1*C+1}]`), '1');
 // the other way leans the other way
 down(board, PAD+4*S, PAD+3*S);
 move(board, PAD+3*S+2, PAD+4*S-2);
 up(board, PAD+3*S+2, PAD+4*S-2);
 ck('the opposite drag leans the other way', ev(`room.diag[${3*C+3}]`), '2');
 // a plain click no longer makes one
 const before=ev(`room.diag[${2*C+2}]`);
 down(board, PAD+2.5*S, PAD+2.5*S);
 up(board, PAD+2.5*S, PAD+2.5*S);
 ck('a click alone does nothing', ev(`room.diag[${2*C+2}]`), before);
 // repeating the same drag removes it
 down(board, PAD+1*S, PAD+1*S);
 move(board, PAD+2*S, PAD+2*S);
 up(board, PAD+2*S, PAD+2*S);
 ck('the same drag again clears it', ev(`room.diag[${1*C+1}]`), '0');
 key('keyup','d');

 console.log('\n--- naming branches ---');
 $('trialStart').click();
 ev(`setEdgeUser(${ev('engine.H(0,0)')},"1",false)`);
 $('trialRename').click();
 ev('render()');
 ck('the name is stored', ev('trial.name'), 'Left side theory');
 ck('and shown in the list',
    ev(`[...document.querySelectorAll('.tw__label')].map(e=>e.textContent).join('|')`).includes('Left side theory'), true);
 window.__prompt='';
 $('trialRename').click(); ev('render()');
 ck('clearing the name shows the premise again',
    /→ line/.test(ev(`[...document.querySelectorAll('.tw__label')].map(e=>e.textContent).join('|')`)), true);
 ev('switchBranch(null)');

 console.log('\n--- check covers xs and colours ---');
 const sol=ev('solutionFor()');
 const onEdge=ev(`(()=>{const s=solutionFor();for(let i=0;i<engine.E;i++)if(s[i]===ON)return i;})()`);
 ev(`setEdgeUser(${onEdge},"2",false)`);          // an x where a line belongs
 $('check').click(); await wait(60);
 ck('a wrong x is reported', /× where a line belongs/.test($('toast').textContent), true);
 ev(`setEdgeUser(${onEdge},"0",false)`);
 // colour two squares that are on opposite sides the same colour
 ev('queueCell(0,"1"); render()');
 $('check').click(); await wait(60);
 const t=$('toast').textContent;
 ck('the check runs with colours present', t.length>0, true);
 console.log('   check said:', t);
 // colour two squares that are genuinely on opposite sides the same colour
 ev('[...Array(engine.NC).keys()].forEach(k=>queueCell(k,"0"))');
 const pair=ev(`(()=>{
   const s=solutionFor();
   const out=new Uint8Array(engine.NC), seen=new Uint8Array(engine.NC), st=[];
   for(let c=0;c<engine.C;c++){ if(s[engine.H(0,c)]!==ON&&!seen[c]){seen[c]=1;st.push(c);} }
   while(st.length){ const k=st.pop(); out[k]=1;
     const r=(k/engine.C)|0,c=k%engine.C;
     for(const [nr,nc,e] of [[r-1,c,engine.H(r,c)],[r+1,c,engine.H(r+1,c)],[r,c-1,engine.V(r,c)],[r,c+1,engine.V(r,c+1)]]){
       if(nr<0||nc<0||nr>=engine.R||nc>=engine.C)continue;
       const n=nr*engine.C+nc;
       if(seen[n]||s[e]===ON)continue;
       seen[n]=1; st.push(n);
     }
   }
   let a=-1,b=-1;
   for(let k=0;k<engine.NC;k++){ if(out[k]&&a<0)a=k; if(!out[k]&&b<0)b=k; }
   return JSON.stringify([a,b]);
 })()`);
 const [outCell,inCell]=JSON.parse(pair);
 if(outCell>=0&&inCell>=0){
   ev(`queueCell(${outCell},"1"); queueCell(${inCell},"1"); render()`);
   $('check').click(); await wait(80);
   ck('two squares on opposite sides, same colour, is caught',
      /coloured the wrong side/.test($('toast').textContent), true);
   ev(`queueCell(${inCell},"2"); render()`);
   $('check').click(); await wait(80);
   ck('colouring them opposite is accepted',
      /coloured the wrong side/.test($('toast').textContent), false);
 }
 console.log(`\n${pass} passed, ${fail} failed`);
 process.exit(fail?1:0);
})();
