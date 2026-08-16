/* The generator's own page: a bar for each puzzle, and no silently throwing
   away a batch that has not been saved. */
const {spawn}=require('child_process');
const p=spawn('node',[require('path').join(__dirname,'..','public','download','slink-gen.js'),'--ui','-o','/tmp/gt.json']);
let url=null,out='';
p.stdout.on('data',d=>{out+=d;const m=/http:\/\/127\.0\.0\.1:\d+\//.exec(out);if(m&&!url){url=m[0];go();}});
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function go(){
 try{
  const page=await (await fetch(url)).text();
  ck('the page has a place for per-puzzle bars', /id="per"/.test(page), true);
  ck('and warns before throwing a batch away',
     /have not been saved/.test(page), true);
  ck('with a way to watch it work', /id="watch"/.test(page), true);

  await fetch(url+'start',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({rows:10,cols:10,count:3,difficulty:'tough'})});
  let sawEach=false, sawPct=false, sawGrid=false, done=null;
  for(let i=0;i<120;i++){
    await wait(400);
    const s=await (await fetch(url+'status')).json();
    if((s.each||[]).length)sawEach=true;
    if((s.each||[]).some(w=>w.stage==='trim'&&w.pct>0&&w.pct<=100))sawPct=true;
    if((s.each||[]).some(w=>w.grid&&w.grid.cells&&w.grid.cells.length===w.grid.R*w.grid.C))sawGrid=true;
    if(s.done){done=s;break;}
  }
  ck('progress is reported per puzzle', sawEach, true);
  ck('with a percentage while trimming', sawPct, true);
  ck('and it finishes', !!done, true);
  ck('the clue grid is sent while it works', sawGrid, true);
  ck('nothing was written until asked',
     require('fs').existsSync('/tmp/gt.json'), false);
 }catch(e){console.log('ERROR',e.message);fail++;}
 console.log(`\n${pass} passed, ${fail} failed`);
 p.kill(); process.exit(fail?1:0);
}
setTimeout(()=>{p.kill();process.exit(1);},120000);
