/* Independently re-solves every puzzle in a pack and reports uniqueness. */
const fs=require('fs');
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
const src=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const core=src.slice(0,src.indexOf('/* ============================================================\n   4. Shared sheet state'));
const vm=require('vm');
const ctx=vm.createContext({performance:require('perf_hooks').performance,setTimeout,console,Math,Date,Int8Array,Int32Array,Uint8Array,Promise,Error,Array,Number,JSON});
vm.runInContext(core+'\nthis.API={Engine,Solver,DIFFS};',ctx);
const {Engine,Solver}=ctx.API;

const pack=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
let ok=0,bad=0;
console.log(`pack: ${pack.puzzles.length} puzzles, generator ${pack.generator}, seed ${pack.seed}`);
pack.puzzles.forEach((p,i)=>{
  const g=Engine(p.R,p.C),S=Solver(g);
  const problems=[];
  if(p.clues.length!==p.R*p.C)problems.push('clue array is the wrong length');
  if(p.clues.some(v=>!Number.isInteger(v)||v< -1||v>4))problems.push('clue out of range');
  const given=p.clues.filter(v=>v>=0).length;
  if(given!==p.given)problems.push(`given count says ${p.given}, actually ${given}`);
  const r=S.solve(Int8Array.from(p.clues),2,4000000);
  if(r.aborted)problems.push('solver ran out of budget');
  else if(r.count!==1)problems.push(`has ${r.count} solutions, not 1`);
  if(p.minimal&&!problems.length){
    const c=Int8Array.from(p.clues);
    let removable=0;
    for(let k=0;k<g.NC;k++){
      if(c[k]<0)continue;
      const keep=c[k];c[k]=-1;
      const q=S.solve(Int8Array.from(c),2,4000000);
      c[k]=keep;
      if(!q.aborted&&q.count===1)removable++;
    }
    if(removable)problems.push(`claims minimal but ${removable} clues are still removable`);
  }
  if(problems.length){bad++;console.log(`  ✗ #${i+1} ${p.R}x${p.C} ${p.diff}: ${problems.join('; ')}`);}
  else {ok++;console.log(`  ✓ #${i+1} ${p.R}x${p.C} ${p.diff}, ${given} clues, unique${p.minimal?', minimal':''}`);}
});
console.log(`${ok} ok, ${bad} bad`);
process.exit(bad?1:0);
