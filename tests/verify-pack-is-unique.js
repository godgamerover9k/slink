const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('slitherlink-plotroom.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const core=src.slice(0,src.indexOf('/* ============================================================\n   4. Shared sheet state'));
const ctx=vm.createContext({performance:require('perf_hooks').performance,setTimeout,console,Math,Date,Int8Array,Int32Array,Uint8Array,Float64Array,Map,Set,Promise,Error,Array,Number,JSON});
vm.runInContext(core+'\nthis.API={Engine,satCount};',ctx);
const {Engine,satCount}=ctx.API;
const pack=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
let ok=0,bad=0;
for(const p of pack.puzzles){
  const g=Engine(p.R,p.C);
  const r=satCount(g,Int8Array.from(p.clues),2,400000);
  const good=r.count===1&&!r.aborted;
  console.log(`${p.R}x${p.C} ${p.given} clues: count=${r.count}${r.aborted?' (gave up)':''} ${good?'UNIQUE':'NOT UNIQUE'}`);
  good?ok++:bad++;
}
console.log(`${ok} ok, ${bad} bad`);
process.exit(bad?1:0);
