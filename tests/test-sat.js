/* The SAT counter must agree with the older search wherever that search is
   conclusive, and must never accept an invalid board. Both bugs found while
   writing it (a lost blocking clause, and a broken watch invariant) showed up
   as duplicate solutions, so identical models are checked for explicitly. */
const fs=require('fs'),vm=require('vm');
const path=require('path');
/* the page is index.html in the repository, and slitherlink-plotroom.html when
   working on it loose; accept either */
function pagePath(){
  for(const p of ['index.html','slitherlink-plotroom.html',
                  path.join(__dirname,'..','index.html')])
    if(require('fs').existsSync(p))return p;
  throw new Error('cannot find the page next to these tests');
}

const src=fs.readFileSync(pagePath(),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const core=src.slice(0,src.indexOf('/* ============================================================\n   4. Shared sheet state'));
const ctx=vm.createContext({performance:require('perf_hooks').performance,setTimeout,console,Math,Date,Int8Array,Int32Array,Uint8Array,Float64Array,Map,Set,Promise,Error,Array,Number,JSON});
vm.runInContext(core+'\nthis.API={Engine,Solver,satCount,SatSolver,satClauses,edgeLoops,growLoop,loopEdges,cluesFromLoop,ON,OFF};',ctx);
const A=ctx.API;
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
  console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};

function problems(g,clues,sol){
  const bad=[];
  for(let k=0;k<g.NC;k++){ if(clues[k]<0)continue;
    let n=0;for(let j=0;j<4;j++)if(sol[g.cEdge[k*4+j]]===A.ON)n++;
    if(n!==clues[k])bad.push(`cell ${k} has ${n} not ${clues[k]}`); }
  const deg=new Int32Array(g.VC); const on=[];
  for(let e=0;e<g.E;e++) if(sol[e]===A.ON){deg[g.ea[e]]++;deg[g.eb[e]]++;on.push(e);}
  for(let v=0;v<g.VC;v++) if(deg[v]!==0&&deg[v]!==2)bad.push(`dot ${v} degree ${deg[v]}`);
  if(!on.length)bad.push('empty board');
  else if(A.edgeLoops(g,on).length!==1)bad.push('more than one loop');
  return bad;
}

console.log('--- agrees with the older search ---');
let agree=0,checked=0,invalid=0,sameTwice=0;
for(let t=0;t<18;t++){
  const N=5+(t%5);
  const g=A.Engine(N,N), S=A.Solver(g);
  const full=A.cluesFromLoop(g,A.loopEdges(g,A.growLoop(N,N)));
  const cl=Int8Array.from(full);
  const drop=[0,0.2,0.45,0.65][t%4];
  for(let k=0;k<g.NC;k++) if(Math.random()<drop) cl[k]=-1;

  const old=S.solve(Int8Array.from(cl),2,1500000);
  const sat=A.satCount(g,cl,2,300000);
  if(sat.solution){ const p=problems(g,cl,sat.solution); if(p.length){invalid++;console.log('   invalid: '+p[0]);} }
  if(!old.aborted&&!sat.aborted){ checked++; if(old.count===sat.count)agree++;
    else console.log(`   mismatch ${N}x${N}: old=${old.count} sat=${sat.count}`); }

  // two reported solutions must actually differ
  if(sat.count===2){
    const S2=A.SatSolver(g.E);
    for(const c of A.satClauses(g,cl))S2.addClause(c);
    const models=[];
    for(let r=0;r<400&&models.length<2;r++){
      S2.reset();
      if(S2.solve(50000)!=='sat')break;
      const m=S2.model(); S2.reset();
      const on=[];for(let e=0;e<g.E;e++)if(m[e])on.push(e);
      const comps=A.edgeLoops(g,on);
      if(comps.length>1){ let s=comps[0];for(const c of comps)if(c.length<s.length)s=c;
        S2.addClause(s.map(e=>e*2+1)); continue; }
      models.push(on.join(','));
      S2.addClause([...Array(g.E).keys()].map(e=>m[e]?e*2+1:e*2));
    }
    if(models.length===2&&models[0]===models[1])sameTwice++;
  }
}
ck(`agreed on all ${checked} conclusive cases`, agree, checked);
ck('never returned an invalid solution', invalid, 0);
ck('never counted one solution twice', sameTwice, 0);

console.log('\n--- settles boards the older search cannot ---');
{
  const g=A.Engine(16,16);
  const full=A.cluesFromLoop(g,A.loopEdges(g,A.growLoop(16,16)));
  const t=Date.now();
  const sat=A.satCount(g,full,2,300000);
  const ms=Date.now()-t;
  console.log(`      16x16 full clues: count=${sat.count} in ${ms}ms, ${sat.nodes} conflicts`);
  ck('16x16 settled', sat.aborted, false);
  ck('and quickly', ms < 5000, true);
}

console.log('\n--- degenerate inputs ---');
{
  const g=A.Engine(3,3);
  const allZero=new Int8Array(9).fill(0);
  const r=A.satCount(g,allZero,2,50000);
  ck('all-zero clues have no loop', r.count, 0);
  const impossible=Int8Array.from([0,0,0,0,4,0,0,0,0]);
  ck('a 4 boxed in by 0s is impossible', A.satCount(g,impossible,2,50000).count, 0);
  const blank=new Int8Array(9).fill(-1);
  const b=A.satCount(g,blank,2,50000);
  ck('no clues at all still yields loops', b.count, 2);
  ck('and those loops are valid', problems(g,blank,b.solution).length, 0);
}

console.log('\n'+'='.repeat(50));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
