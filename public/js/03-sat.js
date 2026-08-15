/* ============================================================
   2b. SAT — a small CDCL solver, and Slitherlink expressed for it

   Counting solutions is the expensive half of making a puzzle, and the
   hand-written search above cannot finish it much past 14x14. The same
   question posed as CNF is settled in milliseconds, so uniqueness goes
   through here instead.

   Literals are encoded as 2*v for "v true" and 2*v+1 for "v false",
   with variables numbered from 0.
   ============================================================ */
function SatSolver(nVars) {
  const NEG = l => l ^ 1,
    VAR = l => l >> 1;
  let clauses = []; // each: array of literals
  const watches = []; // per literal: clause indices
  for (let i = 0; i < nVars * 2; i++) watches.push([]);
  const value = new Int8Array(nVars); // 0 unknown, 1 true, -1 false
  const level = new Int32Array(nVars);
  const reason = new Int32Array(nVars).fill(-1);
  const activity = new Float64Array(nVars);
  const phase = new Int8Array(nVars);
  const trail = new Int32Array(nVars);
  let qhead = 0,
    tsize = 0;
  const trailLim = [];
  let bump = 1,
    conflicts = 0,
    ok = true;

  const litValue = l => {
    const v = value[VAR(l)];
    if (v === 0) return 0;
    return l & 1 ? -v : v;
  };

  function enqueue(l, from) {
    const v = VAR(l);
    value[v] = l & 1 ? -1 : 1;
    level[v] = trailLim.length;
    reason[v] = from === undefined ? -1 : from;
    trail[tsize++] = l;
  }

  function addClause(lits) {
    if (!ok) return false;
    const seen = new Set();
    let out = [];
    for (const l of lits) {
      if (seen.has(NEG(l))) return true; // tautology
      if (seen.has(l)) continue;
      seen.add(l);
      out.push(l);
    }
    /* Clauses are only ever added at level 0. Watching a literal that is
       already false there breaks the watch invariant and the clause never
       fires again - which silently let the same solution be counted twice. */
    if (trailLim.length === 0) {
      for (const l of out) if (litValue(l) > 0) return true; // already satisfied
      out = out.filter(l => litValue(l) === 0);
    }
    if (!out.length) {
      ok = false;
      return false;
    }
    if (out.length === 1) {
      const v = litValue(out[0]);
      if (v < 0) {
        ok = false;
        return false;
      }
      if (v === 0) enqueue(out[0]);
      return true;
    }
    const ci = clauses.length;
    clauses.push(out);
    watches[NEG(out[0])].push(ci);
    watches[NEG(out[1])].push(ci);
    return true;
  }

  /* two-watched-literal propagation */
  function propagate() {
    while (qhead < tsize) {
      const l = trail[qhead++];
      const ws = watches[l];
      let keep = 0;
      for (let wi = 0; wi < ws.length; wi++) {
        const ci = ws[wi];
        const c = clauses[ci];
        const other = NEG(l);
        if (c[0] === other) {
          c[0] = c[1];
          c[1] = other;
        }
        if (litValue(c[0]) > 0) {
          ws[keep++] = ci;
          continue;
        }
        let moved = false;
        for (let k = 2; k < c.length; k++) {
          if (litValue(c[k]) >= 0) {
            c[1] = c[k];
            c[k] = other;
            watches[NEG(c[1])].push(ci);
            moved = true;
            break;
          }
        }
        if (moved) continue;
        ws[keep++] = ci;
        if (litValue(c[0]) < 0) {
          // conflict
          for (let k = wi + 1; k < ws.length; k++) ws[keep++] = ws[k];
          ws.length = keep;
          return ci;
        }
        enqueue(c[0], ci);
      }
      ws.length = keep;
    }
    return -1;
  }

  /* first-UIP conflict analysis */
  const seenV = new Uint8Array(nVars);
  function analyze(confl) {
    const learnt = [0]; // slot 0 filled at the end
    let counter = 0,
      p = -1,
      idx = tsize - 1;
    const touched = [];
    do {
      const c = clauses[confl];
      for (let j = p === -1 ? 0 : 1; j < c.length; j++) {
        const q = c[j],
          v = VAR(q);
        if (seenV[v] || level[v] === 0) continue;
        seenV[v] = 1;
        touched.push(v);
        activity[v] += bump;
        if (level[v] >= trailLim.length) counter++;
        else learnt.push(q);
      }
      while (!seenV[VAR(trail[idx])]) idx--;
      p = trail[idx--];
      seenV[VAR(p)] = 0;
      confl = reason[VAR(p)];
      counter--;
    } while (counter > 0);
    learnt[0] = NEG(p);
    let back = 0;
    if (learnt.length > 1) {
      let best = 1;
      for (let i = 2; i < learnt.length; i++)
        if (level[VAR(learnt[i])] > level[VAR(learnt[best])]) best = i;
      const t = learnt[1];
      learnt[1] = learnt[best];
      learnt[best] = t;
      back = level[VAR(learnt[1])];
    }
    for (const v of touched) seenV[v] = 0;
    return { learnt, back };
  }

  function cancelUntil(lvl) {
    if (trailLim.length <= lvl) return;
    const lim = trailLim[lvl];
    for (let i = tsize - 1; i >= lim; i--) {
      const v = VAR(trail[i]);
      phase[v] = value[v] > 0 ? 1 : -1;
      value[v] = 0;
      reason[v] = -1;
    }
    tsize = lim;
    qhead = lim;
    trailLim.length = lvl;
  }

  function pickBranch() {
    let best = -1,
      bestA = -1;
    for (let v = 0; v < nVars; v++) {
      if (value[v] !== 0) continue;
      if (activity[v] > bestA) {
        bestA = activity[v];
        best = v;
      }
    }
    if (best < 0) return -1;
    return phase[best] < 0 ? best * 2 + 1 : best * 2;
  }

  /* budget is a conflict limit; returns "sat" | "unsat" | "budget" */
  function solve(budget) {
    if (!ok) return "unsat";
    let used = 0;
    let restart = 100;
    for (;;) {
      const confl = propagate();
      if (confl >= 0) {
        conflicts++;
        used++;
        if (trailLim.length === 0) {
          ok = false;
          return "unsat";
        }
        const { learnt, back } = analyze(confl);
        cancelUntil(back);
        if (learnt.length === 1) enqueue(learnt[0]);
        else {
          const ci = clauses.length;
          clauses.push(learnt);
          watches[NEG(learnt[0])].push(ci);
          watches[NEG(learnt[1])].push(ci);
          enqueue(learnt[0], ci);
        }
        bump *= 1.05;
        if (bump > 1e100) {
          for (let v = 0; v < nVars; v++) activity[v] *= 1e-100;
          bump *= 1e-100;
        }
        if (budget && used >= budget) return "budget";
        if (used >= restart) {
          restart += Math.max(100, restart >> 1);
          cancelUntil(0);
        }
      } else {
        const l = pickBranch();
        if (l < 0) return "sat";
        trailLim.push(tsize);
        enqueue(l);
      }
    }
  }

  return {
    addClause,
    solve,
    reset() {
      cancelUntil(0);
    },
    model() {
      const m = new Uint8Array(nVars);
      for (let v = 0; v < nVars; v++) m[v] = value[v] > 0 ? 1 : 0;
      return m;
    },
    get ok() {
      return ok;
    },
    get conflicts() {
      return conflicts;
    },
  };
}

/* ---- Slitherlink as CNF ----
   one variable per edge; each clue is exactly-k of its four edges; each dot
   has degree 0 or 2. "exactly one loop" is not expressible here and is
   handled by refutation in satCount below. */
function satClauses(engine, clues) {
  const out = [];
  const P = e => e * 2,
    N = e => e * 2 + 1;
  for (let k = 0; k < engine.NC; k++) {
    const want = clues[k];
    if (want < 0) continue;
    const es = [
      engine.cEdge[k * 4],
      engine.cEdge[k * 4 + 1],
      engine.cEdge[k * 4 + 2],
      engine.cEdge[k * 4 + 3],
    ];
    if (want === 0) {
      for (const e of es) out.push([N(e)]);
      continue;
    }
    if (want === 4) {
      for (const e of es) out.push([P(e)]);
      continue;
    }
    // at most `want`: no want+1 of them true
    combos(es, want + 1, c => out.push(c.map(N)));
    // at least `want`: no 4-want+1 of them false
    combos(es, 4 - want + 1, c => out.push(c.map(P)));
  }
  for (let v = 0; v < engine.VC; v++) {
    const n = engine.vDeg[v];
    const es = [];
    for (let j = 0; j < n; j++) es.push(engine.vEdge[v * 4 + j]);
    // never degree 1: if one is drawn another must be
    for (const e of es) out.push([N(e)].concat(es.filter(o => o !== e).map(P)));
    // at most two
    combos(es, 3, c => out.push(c.map(N)));
  }
  const any = [];
  for (let e = 0; e < engine.E; e++) any.push(P(e));
  out.push(any); // the empty board is not a solution
  return out;
}
function combos(arr, k, fn) {
  if (k > arr.length) return;
  const idx = [];
  (function rec(start) {
    if (idx.length === k) {
      fn(idx.map(i => arr[i]));
      return;
    }
    for (let i = start; i < arr.length; i++) {
      idx.push(i);
      rec(i + 1);
      idx.pop();
    }
  })(0);
}

/* Components of the drawn edges, so a model made of several loops can be
   refuted rather than accepted. */
function edgeLoops(engine, on) {
  const adj = new Map();
  for (const e of on) {
    for (const v of [engine.ea[e], engine.eb[e]]) {
      let a = adj.get(v);
      if (!a) {
        a = [];
        adj.set(v, a);
      }
      a.push(e);
    }
  }
  const seen = new Set(),
    comps = [];
  for (const s of on) {
    if (seen.has(s)) continue;
    const stack = [s],
      comp = [];
    seen.add(s);
    while (stack.length) {
      const e = stack.pop();
      comp.push(e);
      for (const v of [engine.ea[e], engine.eb[e]])
        for (const f of adj.get(v) || [])
          if (!seen.has(f)) {
            seen.add(f);
            stack.push(f);
          }
    }
    comps.push(comp);
  }
  return comps;
}

/* Count solutions up to `limit`. Same contract as the older solver:
   {count, solution, aborted}. `budget` is a conflict allowance. */
/* The hand-written search is quicker on the many easy checks; SAT is the one
   that can finish the hard ones. Ask the cheap one first and fall back. */
function countSolutions(CELL, engine, clues, limit, fastBudget, satBudget) {
  const fast = CELL.solve(clues, limit, fastBudget);
  if (!fast.aborted) return fast;
  return satCount(engine, clues, limit, satBudget);
}

function satCount(engine, clues, limit, budget) {
  const CELL = SatSolver(engine.E);
  for (const c of satClauses(engine, clues))
    if (!CELL.addClause(c)) return { count: 0, solution: null, aborted: false, nodes: 0 };
  limit = limit || 2;
  let count = 0,
    solution = null,
    spent = 0,
    rounds = 0;
  const cap = budget || 200000;
  /* Each refuted subloop costs a round but may cost no conflicts at all, so
     rounds are bounded separately; without this a board with many small loops
     spins forever adding clauses. */
  const maxRounds = Math.max(2000, engine.E * 8);
  for (;;) {
    if (count >= limit) break;
    if (++rounds > maxRounds) return { count, solution, aborted: true, nodes: CELL.conflicts };
    CELL.reset();
    const left = cap - spent;
    if (left <= 0) return { count, solution, aborted: true, nodes: CELL.conflicts };
    const r = CELL.solve(left);
    spent = CELL.conflicts;
    if (r === "budget") return { count, solution, aborted: true, nodes: CELL.conflicts };
    if (r === "unsat") break;
    const m = CELL.model();
    CELL.reset(); // back to level 0 before adding clauses: a unit clause
    // added deeper would be undone by the next backtrack and
    // the same solution could then be found twice
    const on = [];
    for (let e = 0; e < engine.E; e++) if (m[e]) on.push(e);
    const comps = edgeLoops(engine, on);
    if (comps.length > 1) {
      // several separate loops: forbid the smallest and look again
      let small = comps[0];
      for (const c of comps) if (c.length < small.length) small = c;
      CELL.addClause(small.map(e => e * 2 + 1));
      continue;
    }
    count++;
    if (!solution) {
      solution = new Uint8Array(engine.E);
      for (let e = 0; e < engine.E; e++) solution[e] = m[e] ? ON : OFF;
    }
    CELL.addClause([...Array(engine.E).keys()].map(e => (m[e] ? e * 2 + 1 : e * 2)));
  }
  return { count, solution, aborted: false, nodes: CELL.conflicts };
}
