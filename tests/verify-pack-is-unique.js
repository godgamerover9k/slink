const fs=require('fs'),vm=require('vm');
const path=require('path');
/* the engine, solver and SAT solver, straight from the script files */
const core=require('./pageload.js').plainScript(['01-engine','02-solver','03-sat'], __dirname);
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
