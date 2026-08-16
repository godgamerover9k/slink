#!/usr/bin/env node
/* slink-gen — offline puzzle generator for the Slitherlink plot room.
   Generated from slitherlink-plotroom.html; do not edit by hand.
   Requires Node 18 or newer. No dependencies. */
"use strict";

/* ============================================================
   1. Engine — grid geometry
   ============================================================ */
const UNK = 0,
  ON = 1,
  OFF = 2;

function Engine(R, C) {
  const H_EDGE_COUNT = (R + 1) * C,
    VN = R * (C + 1),
    EDGE_COUNT = H_EDGE_COUNT + VN,
    DOT_COUNT = (R + 1) * (C + 1),
    CELL_COUNT = R * C;
  const H = (r, c) => r * C + c,
    V = (r, c) => H_EDGE_COUNT + r * (C + 1) + c;
  const ea = new Int32Array(EDGE_COUNT),
    eb = new Int32Array(EDGE_COUNT);
  for (let r = 0; r <= R; r++)
    for (let c = 0; c < C; c++) {
      const i = H(r, c);
      ea[i] = r * (C + 1) + c;
      eb[i] = r * (C + 1) + c + 1;
    }
  for (let r = 0; r < R; r++)
    for (let c = 0; c <= C; c++) {
      const i = V(r, c);
      ea[i] = r * (C + 1) + c;
      eb[i] = (r + 1) * (C + 1) + c;
    }
  const vDeg = new Int8Array(DOT_COUNT),
    vEdge = new Int32Array(DOT_COUNT * 4).fill(-1);
  for (let i = 0; i < EDGE_COUNT; i++) {
    vEdge[ea[i] * 4 + vDeg[ea[i]]++] = i;
    vEdge[eb[i] * 4 + vDeg[eb[i]]++] = i;
  }
  const cEdge = new Int32Array(CELL_COUNT * 4);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const k = r * C + c;
      cEdge[k * 4] = H(r, c);
      cEdge[k * 4 + 1] = H(r + 1, c);
      cEdge[k * 4 + 2] = V(r, c);
      cEdge[k * 4 + 3] = V(r, c + 1);
    }
  // per cell, 4 corners: [inA,inB,out1,out2]
  const corner = new Int32Array(CELL_COUNT * 16).fill(-1);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const k = r * C + c,
        b = k * 16,
        top = H(r, c),
        bot = H(r + 1, c),
        lef = V(r, c),
        rig = V(r, c + 1);
      corner[b] = top;
      corner[b + 1] = lef;
      corner[b + 2] = c > 0 ? H(r, c - 1) : -1;
      corner[b + 3] = r > 0 ? V(r - 1, c) : -1;
      corner[b + 4] = top;
      corner[b + 5] = rig;
      corner[b + 6] = c + 1 < C ? H(r, c + 1) : -1;
      corner[b + 7] = r > 0 ? V(r - 1, c + 1) : -1;
      corner[b + 8] = bot;
      corner[b + 9] = lef;
      corner[b + 10] = c > 0 ? H(r + 1, c - 1) : -1;
      corner[b + 11] = r + 1 < R ? V(r + 1, c) : -1;
      corner[b + 12] = bot;
      corner[b + 13] = rig;
      corner[b + 14] = c + 1 < C ? H(r + 1, c + 1) : -1;
      corner[b + 15] = r + 1 < R ? V(r + 1, c + 1) : -1;
    }
  const cellsAtV = [];
  for (let v = 0; v < DOT_COUNT; v++) cellsAtV.push([]);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const k = r * C + c;
      cellsAtV[r * (C + 1) + c].push(k);
      cellsAtV[r * (C + 1) + c + 1].push(k);
      cellsAtV[(r + 1) * (C + 1) + c].push(k);
      cellsAtV[(r + 1) * (C + 1) + c + 1].push(k);
    }
  const affN = new Int8Array(EDGE_COUNT),
    aff = new Int32Array(EDGE_COUNT * 6).fill(-1);
  for (let i = 0; i < EDGE_COUNT; i++) {
    const set = new Set([...cellsAtV[ea[i]], ...cellsAtV[eb[i]]]);
    for (const k of set) aff[i * 6 + affN[i]++] = k;
  }
  return {
    R,
    C,
    HN: H_EDGE_COUNT,
    VN,
    E: EDGE_COUNT,
    VC: DOT_COUNT,
    NC: CELL_COUNT,
    H,
    V,
    ea,
    eb,
    vDeg,
    vEdge,
    cEdge,
    corner,
    affN,
    aff,
  };
}

/* ============================================================
   2. Solver — used for generation, hints and error checks
   ============================================================ */
function Solver(engine) {
  const EDGE_COUNT = engine.E,
    DOT_COUNT = engine.VC,
    CELL_COUNT = engine.NC;
  const st = new Uint8Array(EDGE_COUNT),
    trail = new Int32Array(EDGE_COUNT);
  let trailTop = 0;
  const parent = new Int32Array(DOT_COUNT),
    usize = new Int32Array(DOT_COUNT),
    utrail = new Int32Array(EDGE_COUNT * 2);
  let utop = 0,
    cycleFlag = 0;
  const inQ = new Uint8Array(DOT_COUNT + CELL_COUNT),
    queue = new Int32Array(DOT_COUNT + CELL_COUNT + 8);
  let qh = 0,
    qt = 0;
  const deg = new Int8Array(DOT_COUNT),
    seen = new Int32Array(DOT_COUNT),
    stack = new Int32Array(DOT_COUNT);
  let seenMark = 0;
  let clues = null;

  const find = x => {
    while (parent[x] !== x) x = parent[x];
    return x;
  };
  const pushV = v => {
    if (!inQ[v]) {
      inQ[v] = 1;
      queue[qt++] = v;
    }
  };
  const pushC = k => {
    const id = DOT_COUNT + k;
    if (!inQ[id]) {
      inQ[id] = 1;
      queue[qt++] = id;
    }
  };
  function clearQueue() {
    while (qh < qt) inQ[queue[qh++]] = 0;
    qh = qt = 0;
  }

  function setEdge(e, val) {
    if (st[e] !== UNK) return st[e] === val;
    st[e] = val;
    trail[trailTop++] = e;
    pushV(engine.ea[e]);
    pushV(engine.eb[e]);
    const n = engine.affN[e];
    for (let j = 0; j < n; j++) pushC(engine.aff[e * 6 + j]);
    if (val === ON) {
      const ra = find(engine.ea[e]),
        rb = find(engine.eb[e]);
      if (ra === rb) cycleFlag++;
      else {
        let big = ra,
          small = rb;
        if (usize[big] < usize[small]) {
          big = rb;
          small = ra;
        }
        parent[small] = big;
        usize[big] += usize[small];
        utrail[utop++] = small;
        utrail[utop++] = big;
      }
    }
    return true;
  }

  function propagate() {
    while (qh < qt) {
      const id = queue[qh++];
      inQ[id] = 0;
      if (id < DOT_COUNT) {
        const v = id,
          base = v * 4,
          n = engine.vDeg[v];
        let on = 0,
          unk = 0,
          lastUnk = -1;
        for (let j = 0; j < n; j++) {
          const e = engine.vEdge[base + j],
            s = st[e];
          if (s === ON) on++;
          else if (s === UNK) {
            unk++;
            lastUnk = e;
          }
        }
        if (on > 2) {
          clearQueue();
          return false;
        }
        if (on === 2) {
          if (unk)
            for (let j = 0; j < n; j++) {
              const e = engine.vEdge[base + j];
              if (st[e] === UNK) setEdge(e, OFF);
            }
        } else if (on === 1) {
          if (unk === 0) {
            clearQueue();
            return false;
          }
          if (unk === 1) setEdge(lastUnk, ON);
        } else if (on === 0 && unk === 1) setEdge(lastUnk, OFF);
      } else {
        const k = id - DOT_COUNT,
          want = clues[k];
        if (want < 0) continue;
        const base = k * 4;
        let on = 0,
          unk = 0;
        for (let j = 0; j < 4; j++) {
          const s = st[engine.cEdge[base + j]];
          if (s === ON) on++;
          else if (s === UNK) unk++;
        }
        if (on > want || on + unk < want) {
          clearQueue();
          return false;
        }
        if (unk) {
          if (on === want) {
            for (let j = 0; j < 4; j++) {
              const e = engine.cEdge[base + j];
              if (st[e] === UNK) setEdge(e, OFF);
            }
          } else if (on + unk === want) {
            for (let j = 0; j < 4; j++) {
              const e = engine.cEdge[base + j];
              if (st[e] === UNK) setEdge(e, ON);
            }
          }
        }
        // corner rule: with no line able to arrive from outside the cell, the cell's
        // two segments at that corner are both drawn or both blank.
        if (want >= 1 && want <= 3) {
          const cb = k * 16;
          for (let q = 0; q < 4; q++) {
            const o1 = engine.corner[cb + q * 4 + 2],
              o2 = engine.corner[cb + q * 4 + 3];
            if ((o1 < 0 ? OFF : st[o1]) !== OFF) continue;
            if ((o2 < 0 ? OFF : st[o2]) !== OFF) continue;
            const i1 = engine.corner[cb + q * 4],
              i2 = engine.corner[cb + q * 4 + 1],
              s1 = st[i1],
              s2 = st[i2];
            if (want === 1) {
              if (s1 === UNK) setEdge(i1, OFF);
              if (s2 === UNK) setEdge(i2, OFF);
            } else if (want === 3) {
              if (s1 === UNK) setEdge(i1, ON);
              if (s2 === UNK) setEdge(i2, ON);
            } else {
              if (s1 === ON && s2 === UNK) setEdge(i2, ON);
              else if (s1 === OFF && s2 === UNK) setEdge(i2, OFF);
              else if (s2 === ON && s1 === UNK) setEdge(i1, ON);
              else if (s2 === OFF && s1 === UNK) setEdge(i1, OFF);
            }
          }
        }
      }
    }
    qh = qt = 0;
    return true;
  }

  function verify() {
    deg.fill(0);
    let onCount = 0,
      anyV = -1;
    for (let i = 0; i < EDGE_COUNT; i++)
      if (st[i] === ON) {
        deg[engine.ea[i]]++;
        deg[engine.eb[i]]++;
        onCount++;
        anyV = engine.ea[i];
      }
    if (!onCount) return false;
    let vertsWithDeg = 0;
    for (let v = 0; v < DOT_COUNT; v++) {
      if (deg[v] !== 0 && deg[v] !== 2) return false;
      if (deg[v]) vertsWithDeg++;
    }
    seenMark++;
    let sp = 0;
    stack[sp++] = anyV;
    seen[anyV] = seenMark;
    let reached = 1;
    while (sp) {
      const v = stack[--sp],
        base = v * 4,
        n = engine.vDeg[v];
      for (let j = 0; j < n; j++) {
        const e = engine.vEdge[base + j];
        if (st[e] !== ON) continue;
        const w = engine.ea[e] === v ? engine.eb[e] : engine.ea[e];
        if (seen[w] !== seenMark) {
          seen[w] = seenMark;
          reached++;
          stack[sp++] = w;
        }
      }
    }
    if (reached !== vertsWithDeg) return false;
    for (let k = 0; k < CELL_COUNT; k++) {
      const want = clues[k];
      if (want < 0) continue;
      const base = k * 4;
      let on = 0;
      for (let j = 0; j < 4; j++) if (st[engine.cEdge[base + j]] === ON) on++;
      if (on !== want) return false;
    }
    return true;
  }

  function pick() {
    for (let v = 0; v < DOT_COUNT; v++) {
      const base = v * 4,
        n = engine.vDeg[v];
      let on = 0,
        unkE = -1;
      for (let j = 0; j < n; j++) {
        const e = engine.vEdge[base + j];
        if (st[e] === ON) on++;
        else if (st[e] === UNK && unkE < 0) unkE = e;
      }
      if (on === 1 && unkE >= 0) return unkE;
    }
    let best = -1,
      bestScore = 9;
    for (let k = 0; k < CELL_COUNT; k++) {
      if (clues[k] < 0) continue;
      const base = k * 4;
      let unk = 0,
        p = -1;
      for (let j = 0; j < 4; j++) {
        const e = engine.cEdge[base + j];
        if (st[e] === UNK) {
          unk++;
          p = e;
        }
      }
      if (unk > 0 && unk < bestScore) {
        bestScore = unk;
        best = p;
      }
    }
    if (best >= 0) return best;
    for (let i = 0; i < EDGE_COUNT; i++) if (st[i] === UNK) return i;
    return -1;
  }

  let count = 0,
    limit = 2,
    nodes = 0,
    budget = 0,
    aborted = false,
    solution = null;
  function found() {
    count++;
    if (!solution) {
      solution = st.slice();
      for (let i = 0; i < EDGE_COUNT; i++) if (solution[i] === UNK) solution[i] = OFF;
    }
  }

  /* cy0 is the cycle count from *before* the parent placed its edge. Reading
     cycleFlag on entry instead would miss a loop closed by that very edge,
     and the finished solution would be thrown away unexamined. */
  function rec(cy0) {
    if (count >= limit || aborted) return;
    if (++nodes > budget) {
      aborted = true;
      return;
    }
    const cy = cy0 === undefined ? cycleFlag : cy0;
    if (!propagate()) return;
    if (cycleFlag > cy) {
      if (verify()) found();
      return;
    }
    const e = pick();
    if (e < 0) {
      // every edge decided: judge the board as it stands
      if (verify()) found();
      return;
    }
    for (let v = 0; v < 2; v++) {
      const tm = trailTop,
        um = utop,
        cf = cycleFlag;
      setEdge(e, v === 0 ? ON : OFF);
      rec(cf);
      clearQueue();
      while (utop > um) {
        const big = utrail[--utop],
          small = utrail[--utop];
        usize[big] -= usize[small];
        parent[small] = small;
      }
      while (trailTop > tm) st[trail[--trailTop]] = UNK;
      cycleFlag = cf;
      if (count >= limit || aborted) return;
    }
  }

  function snap() {
    const s = st.slice();
    for (let i = 0; i < EDGE_COUNT; i++) if (s[i] === UNK) s[i] = OFF;
    return s;
  }

  /* Deductions that follow from the clue numbers alone, so they only need
     applying once at the start rather than on every propagation pass.
     These are the standard published Slitherlink patterns for touching 3s. */
  function clueRules() {
    const { R, C, H, V } = engine;
    const at = (r, c) => (r < 0 || c < 0 || r >= R || c >= C ? -1 : clues[r * C + c]);
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        if (clues[r * C + c] !== 3) continue;

        // two 3s side by side: the shared edge and both outer edges are drawn,
        // and the shared edge cannot continue past either end
        if (at(r, c + 1) === 3) {
          if (!setEdge(V(r, c), ON)) return false;
          if (!setEdge(V(r, c + 1), ON)) return false;
          if (!setEdge(V(r, c + 2), ON)) return false;
          if (r > 0 && !setEdge(V(r - 1, c + 1), OFF)) return false;
          if (r + 1 < R && !setEdge(V(r + 1, c + 1), OFF)) return false;
        }
        if (at(r + 1, c) === 3) {
          if (!setEdge(H(r, c), ON)) return false;
          if (!setEdge(H(r + 1, c), ON)) return false;
          if (!setEdge(H(r + 2, c), ON)) return false;
          if (c > 0 && !setEdge(H(r + 1, c - 1), OFF)) return false;
          if (c + 1 < C && !setEdge(H(r + 1, c + 1), OFF)) return false;
        }

        // 3s touching only at a corner: each one's two far edges are drawn
        if (at(r + 1, c + 1) === 3) {
          if (!setEdge(H(r, c), ON)) return false;
          if (!setEdge(V(r, c), ON)) return false;
          if (!setEdge(H(r + 2, c + 1), ON)) return false;
          if (!setEdge(V(r + 1, c + 2), ON)) return false;
        }
        if (at(r + 1, c - 1) === 3) {
          if (!setEdge(H(r, c), ON)) return false;
          if (!setEdge(V(r, c + 1), ON)) return false;
          if (!setEdge(H(r + 2, c - 1), ON)) return false;
          if (!setEdge(V(r + 1, c - 1), ON)) return false;
        }
      }
    return true;
  }

  /* preset: an array of ON/OFF/UNK asserted before the search starts, so a
     part-finished board can be tested for consistency. */
  function solve(cl, lim, bud, preset) {
    clues = cl;
    st.fill(UNK);
    trailTop = 0;
    utop = 0;
    cycleFlag = 0;
    for (let v = 0; v < DOT_COUNT; v++) {
      parent[v] = v;
      usize[v] = 1;
    }
    qh = qt = 0;
    inQ.fill(0);
    limit = lim || 2;
    budget = bud || 200000;
    nodes = 0;
    aborted = false;
    count = 0;
    solution = null;
    for (let v = 0; v < DOT_COUNT; v++) pushV(v);
    for (let k = 0; k < CELL_COUNT; k++) pushC(k);
    /* The touching-3s patterns were tried here and removed. They are sound and
       cut nodes ~1.5x on average, but on some boards they wrecked the branching
       order: one 8x8 went from 3,553 nodes to over 8,000,000. Average gains are
       not worth a tail that turns a solvable puzzle into a timeout. */
    if (preset) {
      for (let i = 0; i < EDGE_COUNT; i++) {
        const p = preset[i];
        if (p !== ON && p !== OFF) continue;
        if (!setEdge(i, p)) {
          clearQueue();
          return { count: 0, solution: null, aborted: false, nodes: 0 };
        }
      }
      // a preset that already closes a loop can't be extended, so judge it as it stands
      if (cycleFlag > 0) {
        if (propagate() && verify()) {
          count = 1;
          solution = snap();
        }
        clearQueue();
        return { count, solution, aborted: false, nodes: 0 };
      }
    }
    rec();
    return { count, solution, aborted, nodes };
  }
  return { solve };
}

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

/* ============================================================
   3. Generator — a random simply connected blob makes the loop
   ============================================================ */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function regionValid(R, C, inside) {
  const N = R * C;
  let start = -1,
    size = 0;
  for (let i = 0; i < N; i++)
    if (inside[i]) {
      if (start < 0) start = i;
      size++;
    }
  if (!size || size === N) return false;
  const seen = new Uint8Array(N);
  let st = [start];
  seen[start] = 1;
  let cnt = 1;
  while (st.length) {
    const k = st.pop(),
      r = (k / C) | 0,
      c = k % C;
    if (r > 0 && inside[k - C] && !seen[k - C]) {
      seen[k - C] = 1;
      cnt++;
      st.push(k - C);
    }
    if (r < R - 1 && inside[k + C] && !seen[k + C]) {
      seen[k + C] = 1;
      cnt++;
      st.push(k + C);
    }
    if (c > 0 && inside[k - 1] && !seen[k - 1]) {
      seen[k - 1] = 1;
      cnt++;
      st.push(k - 1);
    }
    if (c < C - 1 && inside[k + 1] && !seen[k + 1]) {
      seen[k + 1] = 1;
      cnt++;
      st.push(k + 1);
    }
  }
  if (cnt !== size) return false;
  const PR = R + 2,
    PC = C + 2,
    PN = PR * PC,
    out = new Uint8Array(PN);
  let total = 0;
  for (let r = 0; r < PR; r++)
    for (let c = 0; c < PC; c++) {
      const p = r * PC + c;
      const o =
        r === 0 || c === 0 || r === PR - 1 || c === PC - 1
          ? 1
          : inside[(r - 1) * C + (c - 1)]
            ? 0
            : 1;
      out[p] = o;
      if (o) total++;
    }
  const s2 = new Uint8Array(PN);
  st = [0];
  s2[0] = 1;
  let c2 = 1;
  while (st.length) {
    const p = st.pop(),
      r = (p / PC) | 0,
      c = p % PC;
    if (r > 0 && out[p - PC] && !s2[p - PC]) {
      s2[p - PC] = 1;
      c2++;
      st.push(p - PC);
    }
    if (r < PR - 1 && out[p + PC] && !s2[p + PC]) {
      s2[p + PC] = 1;
      c2++;
      st.push(p + PC);
    }
    if (c > 0 && out[p - 1] && !s2[p - 1]) {
      s2[p - 1] = 1;
      c2++;
      st.push(p - 1);
    }
    if (c < PC - 1 && out[p + 1] && !s2[p + 1]) {
      s2[p + 1] = 1;
      c2++;
      st.push(p + 1);
    }
  }
  if (c2 !== total) return false;
  const at = (r, c) => (r < 0 || c < 0 || r >= R || c >= C ? 0 : inside[r * C + c]);
  for (let r = 1; r < R; r++)
    for (let c = 1; c < C; c++) {
      const nw = at(r - 1, c - 1),
        ne = at(r - 1, c),
        sw = at(r, c - 1),
        se = at(r, c);
      if (nw && se && !ne && !sw) return false;
      if (ne && sw && !nw && !se) return false;
    }
  return true;
}
function perimeter(R, C, inside) {
  let p = 0;
  const at = (r, c) => (r < 0 || c < 0 || r >= R || c >= C ? 0 : inside[r * C + c]);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      if (!inside[r * C + c]) continue;
      if (!at(r - 1, c)) p++;
      if (!at(r + 1, c)) p++;
      if (!at(r, c - 1)) p++;
      if (!at(r, c + 1)) p++;
    }
  return p;
}
function growLoop(R, C) {
  const N = R * C,
    inside = new Uint8Array(N);
  inside[(R >> 1) * C + (C >> 1)] = 1;
  const target = Math.max(2, Math.round(N * (0.3 + Math.random() * 0.2)));
  let size = 1,
    guard = 0;
  const growGuard = Math.min(N * 200, 200000);
  while (size < target && guard++ < growGuard) {
    const k = (Math.random() * N) | 0;
    if (inside[k]) continue;
    const r = (k / C) | 0,
      c = k % C;
    let t = false;
    if (r > 0 && inside[k - C]) t = true;
    if (r < R - 1 && inside[k + C]) t = true;
    if (c > 0 && inside[k - 1]) t = true;
    if (c < C - 1 && inside[k + 1]) t = true;
    if (!t) continue;
    inside[k] = 1;
    if (regionValid(R, C, inside)) size++;
    else inside[k] = 0;
  }
  let per = perimeter(R, C, inside);
  // regionValid is O(N), so the tempering pass is capped to stay usable on big sheets
  for (let t = 0, n = Math.min(N * 50, 60000); t < n; t++) {
    const k = (Math.random() * N) | 0,
      was = inside[k];
    inside[k] = was ? 0 : 1;
    if (!regionValid(R, C, inside)) {
      inside[k] = was;
      continue;
    }
    const np = perimeter(R, C, inside);
    if (np > per || Math.random() < 0.12) per = np;
    else inside[k] = was;
  }
  return inside;
}
function loopEdges(engine, inside) {
  const { R, C } = engine,
    at = (r, c) => (r < 0 || c < 0 || r >= R || c >= C ? 0 : inside[r * C + c]);
  const st = new Uint8Array(engine.E);
  for (let r = 0; r <= R; r++)
    for (let c = 0; c < C; c++) st[engine.H(r, c)] = at(r - 1, c) !== at(r, c) ? ON : OFF;
  for (let r = 0; r < R; r++)
    for (let c = 0; c <= C; c++) st[engine.V(r, c)] = at(r, c - 1) !== at(r, c) ? ON : OFF;
  return st;
}
function cluesFromLoop(engine, st) {
  const out = new Int8Array(engine.NC);
  for (let k = 0; k < engine.NC; k++) {
    let n = 0;
    for (let j = 0; j < 4; j++) if (st[engine.cEdge[k * 4 + j]] === ON) n++;
    out[k] = n;
  }
  return out;
}

const DIFFS = {
  gentle: { label: "Gentle", frac: 0.55, base: 1200 },
  standard: { label: "Standard", frac: 0.85, base: 4000 },
  tough: { label: "Tough", frac: 1.0, base: 15000 },
  // keeps sweeping until no single clue can come out without costing the
  // puzzle its one and only solution
  maximal: { label: "Maximal", frac: 1.0, base: 60000, minimal: true },
};

// Chunked so the browser keeps painting while it searches.
function generateAsync(R, C, diffKey, onProgress) {
  return new Promise((resolve, reject) => {
    const engine = Engine(R, C),
      CELL = Solver(engine),
      d = DIFFS[diffKey] || DIFFS.standard;
    // The old formula divided by cell count, so bigger sheets got a smaller
    // budget and every removal check timed out — leaving every clue in place.
    // Take whichever is larger so small grids stay generous and big ones work.
    const fastBudget = Math.max(1000, d.base, Math.round((d.base * 100) / engine.NC)); // search nodes
    const budget = Math.max(2000, Math.round(d.base / 8)); // SAT conflicts
    // Proving a full clue set unique is the expensive half of the job, so cap
    // it per attempt and retry rather than blocking the page on one candidate.
    /* Measured: 16x16 needs ~85k nodes to prove a full clue set unique, 18x18
       about 620k. The old 150k ceiling rejected nearly every candidate loop
       past 16, so large sheets retried forever. */
    const seedBudget = Math.max(20000, engine.NC * 40);
    const fastSeed = Math.max(60000, engine.NC * 400);
    const shapeMs = engine.NC > 900 ? 26 : 1e9;
    const attemptCap = engine.NC > 900 ? 400 : 40;
    const MAXB = 200000; // ceiling when maximal has to prove a hard case
    let phase = 0,
      attempt = 0,
      clues = null,
      order = null,
      i = 0,
      stopAt = 0;
    let pass = 1,
      removed = 0,
      stuck = [],
      curBudget = budget;
    let kept = 0,
      removedAll = 0;

    const remaining = () => {
      const a = [];
      for (let k = 0; k < engine.NC; k++) if (clues[k] >= 0) a.push(k);
      return a;
    };
    function done() {
      let given = 0;
      for (let k = 0; k < engine.NC; k++) if (clues[k] >= 0) given++;
      resolve({
        R,
        C,
        clues: Array.from(clues),
        given,
        minimal: !!d.minimal,
        inconclusive: d.minimal ? stuck.length : 0,
        passes: pass,
      });
    }

    function step() {
      const t0 = performance.now();
      while (performance.now() - t0 < 26) {
        if (phase === 0) {
          if (attempt++ > attemptCap) {
            reject(
              new Error(
                `Gave up after ${attemptCap} attempts on ${R}×${C}. Big puzzles build far quicker in slink-gen — generate one there and import it.`,
              ),
            );
            return;
          }
          if (onProgress) onProgress({ stage: "loop", attempt, R, C });
          const loop = loopEdges(engine, growLoop(R, C, shapeMs));
          const full = cluesFromLoop(engine, loop);
          const chk = countSolutions(CELL, engine, full, 2, fastSeed, seedBudget);
          if (chk.count === 1 && !chk.aborted) {
            clues = Int8Array.from(full);
            kept = 0;
            for (let q = 0; q < engine.NC; q++) if (clues[q] >= 0) kept++;
            order = shuffle([...Array(engine.NC).keys()]);
            stopAt = Math.round(engine.NC * d.frac);
            i = 0;
            phase = 1;
          }
        } else {
          if (i >= stopAt) {
            /* One complete pass already leaves a minimal set. Dropping a clue
               can only ever add solutions, so a clue that was conclusively
               kept stays unremovable however much is taken away afterwards.
               The only unfinished business is checks that ran out of budget,
               so re-test exactly those, with more room each time. */
            if (d.minimal && stuck.length && curBudget < MAXB) {
              curBudget = Math.min(MAXB, curBudget * 6);
              order = stuck;
              stopAt = order.length;
              i = 0;
              stuck = [];
              pass++;
              continue;
            }
            done();
            return;
          }
          const k = order[i++],
            keep = clues[k];
          clues[k] = -1;
          const res = countSolutions(CELL, engine, clues, 2, fastBudget, curBudget);
          if (res.count !== 1 || res.aborted) {
            clues[k] = keep;
            if (res.aborted) stuck.push(k); // unresolved, worth another look
          } else {
            removed++;
            removedAll++;
            kept--;
          }
          if (onProgress)
            onProgress({
              stage: "trim",
              frac: i / stopAt,
              pass,
              checked: i,
              total: stopAt,
              kept,
              removed: removedAll,
              hard: curBudget > budget,
              minimal: !!d.minimal,
            });
        }
      }
      setTimeout(step, 0);
    }
    step();
  });
}
/* ============================================================
   Command line generator
   Everything above this line is lifted verbatim from the web app,
   so the puzzles this makes are built by exactly the same engine
   and checked by exactly the same solver.
   ============================================================ */
const { Worker } = require("node:worker_threads");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const VERSION = "1.1.0";


/* seedable RNG — the engine calls Math.random, so we swap it out wholesale */
function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

/* The browser build slices its work into 26ms chunks and hands control back
   to the page between them. Off the page there is nothing to stay responsive
   for, so this runs the identical algorithm straight through. */
function generateSync(R,C,diffKey,scale,onTick,stopping){
  const g=Engine(R,C), S=Solver(g), d=DIFFS[diffKey]||DIFFS.standard;
  scale=scale||1;
  const fastBudget=Math.max(1000,d.base,Math.round(d.base*100/g.NC))*scale; // search nodes
  const budget=Math.max(2000,Math.round(d.base/8))*scale;                   // SAT conflicts
  const fastSeed=Math.max(60000,g.NC*400)*scale;
  const seedBudget=Math.max(20000,g.NC*40)*scale;
  const MAXB=200000*scale;
  const LOOP_MS=180000*scale;         // fail with an explanation, not forever

  let clues=null,attempt=0;
  const tLoop=Date.now();
  for(;;){
    attempt++;
    if(onTick)onTick({stage:"loop",attempt});
    const full=cluesFromLoop(g,loopEdges(g,growLoop(R,C)));
    const chk=countSolutions(S,g,full,2,fastSeed,seedBudget);
    if(chk.count===1&&!chk.aborted){ clues=Int8Array.from(full); break; }
    if(stopping&&stopping())
      throw new Error("stopped before a loop was settled — nothing to save yet");
    if(Date.now()-tLoop>LOOP_MS)
      throw new Error(`${R}x${C} is too big for this generator to certify: after `
        +`${attempt} attempts it could not prove any clue set has just one solution. `
        +`Try a smaller grid, or --scale 4 to allow a longer search.`);
  }
  return trim(g,S,d,clues,budget,MAXB,R,C,diffKey,onTick,fastBudget,stopping);
}

function trim(g,S,d,clues,budget,MAXB,R,C,diffKey,onTick,fastBudget,stopping){
  let order=shuffle([...Array(g.NC).keys()]);
  let stopAt=Math.round(g.NC*d.frac);
  let curBudget=budget,pass=1,stuck=[],checked=0;
  for(;;){
    for(let i=0;i<stopAt;i++){
      if(stopping&&stopping())return finish(true);
      const k=order[i],keep=clues[k];
      if(keep<0)continue;
      clues[k]=-1;
      const res=countSolutions(S,g,clues,2,fastBudget,curBudget);
      if(res.count!==1||res.aborted){ clues[k]=keep; if(res.aborted)stuck.push(k); }
      if(onTick&&(++checked&15)===0)
        onTick({stage:"trim",checked,left:[...clues].filter(v=>v>=0).length});
    }
    /* One complete pass already leaves a minimal set: dropping a clue can only
       add solutions, so anything conclusively kept stays unremovable no matter
       what is taken out later. Only the checks that ran out of budget are
       still open, so re-test exactly those with more room. */
    if(d.minimal&&stuck.length&&curBudget<MAXB){
      curBudget=Math.min(MAXB,curBudget*6);
      order=stuck; stopAt=order.length; stuck=[]; pass++;
      continue;
    }
    break;
  }
  return finish(false);

  function finish(stopped){
    let given=0; for(let k=0;k<g.NC;k++)if(clues[k]>=0)given++;
    return {R,C,diff:diffKey,given,minimal:!!d.minimal&&!stopped,stopped,
            inconclusive:d.minimal?stuck.length:0,passes:pass,clues:Array.from(clues)};
  }
}


/* the worker runs this, spawned with eval so it survives packaging */
const WORKER_SRC="\"use strict\";\n\n/* ============================================================\n   1. Engine — grid geometry\n   ============================================================ */\nconst UNK = 0,\n  ON = 1,\n  OFF = 2;\n\nfunction Engine(R, C) {\n  const H_EDGE_COUNT = (R + 1) * C,\n    VN = R * (C + 1),\n    EDGE_COUNT = H_EDGE_COUNT + VN,\n    DOT_COUNT = (R + 1) * (C + 1),\n    CELL_COUNT = R * C;\n  const H = (r, c) => r * C + c,\n    V = (r, c) => H_EDGE_COUNT + r * (C + 1) + c;\n  const ea = new Int32Array(EDGE_COUNT),\n    eb = new Int32Array(EDGE_COUNT);\n  for (let r = 0; r <= R; r++)\n    for (let c = 0; c < C; c++) {\n      const i = H(r, c);\n      ea[i] = r * (C + 1) + c;\n      eb[i] = r * (C + 1) + c + 1;\n    }\n  for (let r = 0; r < R; r++)\n    for (let c = 0; c <= C; c++) {\n      const i = V(r, c);\n      ea[i] = r * (C + 1) + c;\n      eb[i] = (r + 1) * (C + 1) + c;\n    }\n  const vDeg = new Int8Array(DOT_COUNT),\n    vEdge = new Int32Array(DOT_COUNT * 4).fill(-1);\n  for (let i = 0; i < EDGE_COUNT; i++) {\n    vEdge[ea[i] * 4 + vDeg[ea[i]]++] = i;\n    vEdge[eb[i] * 4 + vDeg[eb[i]]++] = i;\n  }\n  const cEdge = new Int32Array(CELL_COUNT * 4);\n  for (let r = 0; r < R; r++)\n    for (let c = 0; c < C; c++) {\n      const k = r * C + c;\n      cEdge[k * 4] = H(r, c);\n      cEdge[k * 4 + 1] = H(r + 1, c);\n      cEdge[k * 4 + 2] = V(r, c);\n      cEdge[k * 4 + 3] = V(r, c + 1);\n    }\n  // per cell, 4 corners: [inA,inB,out1,out2]\n  const corner = new Int32Array(CELL_COUNT * 16).fill(-1);\n  for (let r = 0; r < R; r++)\n    for (let c = 0; c < C; c++) {\n      const k = r * C + c,\n        b = k * 16,\n        top = H(r, c),\n        bot = H(r + 1, c),\n        lef = V(r, c),\n        rig = V(r, c + 1);\n      corner[b] = top;\n      corner[b + 1] = lef;\n      corner[b + 2] = c > 0 ? H(r, c - 1) : -1;\n      corner[b + 3] = r > 0 ? V(r - 1, c) : -1;\n      corner[b + 4] = top;\n      corner[b + 5] = rig;\n      corner[b + 6] = c + 1 < C ? H(r, c + 1) : -1;\n      corner[b + 7] = r > 0 ? V(r - 1, c + 1) : -1;\n      corner[b + 8] = bot;\n      corner[b + 9] = lef;\n      corner[b + 10] = c > 0 ? H(r + 1, c - 1) : -1;\n      corner[b + 11] = r + 1 < R ? V(r + 1, c) : -1;\n      corner[b + 12] = bot;\n      corner[b + 13] = rig;\n      corner[b + 14] = c + 1 < C ? H(r + 1, c + 1) : -1;\n      corner[b + 15] = r + 1 < R ? V(r + 1, c + 1) : -1;\n    }\n  const cellsAtV = [];\n  for (let v = 0; v < DOT_COUNT; v++) cellsAtV.push([]);\n  for (let r = 0; r < R; r++)\n    for (let c = 0; c < C; c++) {\n      const k = r * C + c;\n      cellsAtV[r * (C + 1) + c].push(k);\n      cellsAtV[r * (C + 1) + c + 1].push(k);\n      cellsAtV[(r + 1) * (C + 1) + c].push(k);\n      cellsAtV[(r + 1) * (C + 1) + c + 1].push(k);\n    }\n  const affN = new Int8Array(EDGE_COUNT),\n    aff = new Int32Array(EDGE_COUNT * 6).fill(-1);\n  for (let i = 0; i < EDGE_COUNT; i++) {\n    const set = new Set([...cellsAtV[ea[i]], ...cellsAtV[eb[i]]]);\n    for (const k of set) aff[i * 6 + affN[i]++] = k;\n  }\n  return {\n    R,\n    C,\n    HN: H_EDGE_COUNT,\n    VN,\n    E: EDGE_COUNT,\n    VC: DOT_COUNT,\n    NC: CELL_COUNT,\n    H,\n    V,\n    ea,\n    eb,\n    vDeg,\n    vEdge,\n    cEdge,\n    corner,\n    affN,\n    aff,\n  };\n}\n\n/* ============================================================\n   2. Solver — used for generation, hints and error checks\n   ============================================================ */\nfunction Solver(engine) {\n  const EDGE_COUNT = engine.E,\n    DOT_COUNT = engine.VC,\n    CELL_COUNT = engine.NC;\n  const st = new Uint8Array(EDGE_COUNT),\n    trail = new Int32Array(EDGE_COUNT);\n  let trailTop = 0;\n  const parent = new Int32Array(DOT_COUNT),\n    usize = new Int32Array(DOT_COUNT),\n    utrail = new Int32Array(EDGE_COUNT * 2);\n  let utop = 0,\n    cycleFlag = 0;\n  const inQ = new Uint8Array(DOT_COUNT + CELL_COUNT),\n    queue = new Int32Array(DOT_COUNT + CELL_COUNT + 8);\n  let qh = 0,\n    qt = 0;\n  const deg = new Int8Array(DOT_COUNT),\n    seen = new Int32Array(DOT_COUNT),\n    stack = new Int32Array(DOT_COUNT);\n  let seenMark = 0;\n  let clues = null;\n\n  const find = x => {\n    while (parent[x] !== x) x = parent[x];\n    return x;\n  };\n  const pushV = v => {\n    if (!inQ[v]) {\n      inQ[v] = 1;\n      queue[qt++] = v;\n    }\n  };\n  const pushC = k => {\n    const id = DOT_COUNT + k;\n    if (!inQ[id]) {\n      inQ[id] = 1;\n      queue[qt++] = id;\n    }\n  };\n  function clearQueue() {\n    while (qh < qt) inQ[queue[qh++]] = 0;\n    qh = qt = 0;\n  }\n\n  function setEdge(e, val) {\n    if (st[e] !== UNK) return st[e] === val;\n    st[e] = val;\n    trail[trailTop++] = e;\n    pushV(engine.ea[e]);\n    pushV(engine.eb[e]);\n    const n = engine.affN[e];\n    for (let j = 0; j < n; j++) pushC(engine.aff[e * 6 + j]);\n    if (val === ON) {\n      const ra = find(engine.ea[e]),\n        rb = find(engine.eb[e]);\n      if (ra === rb) cycleFlag++;\n      else {\n        let big = ra,\n          small = rb;\n        if (usize[big] < usize[small]) {\n          big = rb;\n          small = ra;\n        }\n        parent[small] = big;\n        usize[big] += usize[small];\n        utrail[utop++] = small;\n        utrail[utop++] = big;\n      }\n    }\n    return true;\n  }\n\n  function propagate() {\n    while (qh < qt) {\n      const id = queue[qh++];\n      inQ[id] = 0;\n      if (id < DOT_COUNT) {\n        const v = id,\n          base = v * 4,\n          n = engine.vDeg[v];\n        let on = 0,\n          unk = 0,\n          lastUnk = -1;\n        for (let j = 0; j < n; j++) {\n          const e = engine.vEdge[base + j],\n            s = st[e];\n          if (s === ON) on++;\n          else if (s === UNK) {\n            unk++;\n            lastUnk = e;\n          }\n        }\n        if (on > 2) {\n          clearQueue();\n          return false;\n        }\n        if (on === 2) {\n          if (unk)\n            for (let j = 0; j < n; j++) {\n              const e = engine.vEdge[base + j];\n              if (st[e] === UNK) setEdge(e, OFF);\n            }\n        } else if (on === 1) {\n          if (unk === 0) {\n            clearQueue();\n            return false;\n          }\n          if (unk === 1) setEdge(lastUnk, ON);\n        } else if (on === 0 && unk === 1) setEdge(lastUnk, OFF);\n      } else {\n        const k = id - DOT_COUNT,\n          want = clues[k];\n        if (want < 0) continue;\n        const base = k * 4;\n        let on = 0,\n          unk = 0;\n        for (let j = 0; j < 4; j++) {\n          const s = st[engine.cEdge[base + j]];\n          if (s === ON) on++;\n          else if (s === UNK) unk++;\n        }\n        if (on > want || on + unk < want) {\n          clearQueue();\n          return false;\n        }\n        if (unk) {\n          if (on === want) {\n            for (let j = 0; j < 4; j++) {\n              const e = engine.cEdge[base + j];\n              if (st[e] === UNK) setEdge(e, OFF);\n            }\n          } else if (on + unk === want) {\n            for (let j = 0; j < 4; j++) {\n              const e = engine.cEdge[base + j];\n              if (st[e] === UNK) setEdge(e, ON);\n            }\n          }\n        }\n        // corner rule: with no line able to arrive from outside the cell, the cell's\n        // two segments at that corner are both drawn or both blank.\n        if (want >= 1 && want <= 3) {\n          const cb = k * 16;\n          for (let q = 0; q < 4; q++) {\n            const o1 = engine.corner[cb + q * 4 + 2],\n              o2 = engine.corner[cb + q * 4 + 3];\n            if ((o1 < 0 ? OFF : st[o1]) !== OFF) continue;\n            if ((o2 < 0 ? OFF : st[o2]) !== OFF) continue;\n            const i1 = engine.corner[cb + q * 4],\n              i2 = engine.corner[cb + q * 4 + 1],\n              s1 = st[i1],\n              s2 = st[i2];\n            if (want === 1) {\n              if (s1 === UNK) setEdge(i1, OFF);\n              if (s2 === UNK) setEdge(i2, OFF);\n            } else if (want === 3) {\n              if (s1 === UNK) setEdge(i1, ON);\n              if (s2 === UNK) setEdge(i2, ON);\n            } else {\n              if (s1 === ON && s2 === UNK) setEdge(i2, ON);\n              else if (s1 === OFF && s2 === UNK) setEdge(i2, OFF);\n              else if (s2 === ON && s1 === UNK) setEdge(i1, ON);\n              else if (s2 === OFF && s1 === UNK) setEdge(i1, OFF);\n            }\n          }\n        }\n      }\n    }\n    qh = qt = 0;\n    return true;\n  }\n\n  function verify() {\n    deg.fill(0);\n    let onCount = 0,\n      anyV = -1;\n    for (let i = 0; i < EDGE_COUNT; i++)\n      if (st[i] === ON) {\n        deg[engine.ea[i]]++;\n        deg[engine.eb[i]]++;\n        onCount++;\n        anyV = engine.ea[i];\n      }\n    if (!onCount) return false;\n    let vertsWithDeg = 0;\n    for (let v = 0; v < DOT_COUNT; v++) {\n      if (deg[v] !== 0 && deg[v] !== 2) return false;\n      if (deg[v]) vertsWithDeg++;\n    }\n    seenMark++;\n    let sp = 0;\n    stack[sp++] = anyV;\n    seen[anyV] = seenMark;\n    let reached = 1;\n    while (sp) {\n      const v = stack[--sp],\n        base = v * 4,\n        n = engine.vDeg[v];\n      for (let j = 0; j < n; j++) {\n        const e = engine.vEdge[base + j];\n        if (st[e] !== ON) continue;\n        const w = engine.ea[e] === v ? engine.eb[e] : engine.ea[e];\n        if (seen[w] !== seenMark) {\n          seen[w] = seenMark;\n          reached++;\n          stack[sp++] = w;\n        }\n      }\n    }\n    if (reached !== vertsWithDeg) return false;\n    for (let k = 0; k < CELL_COUNT; k++) {\n      const want = clues[k];\n      if (want < 0) continue;\n      const base = k * 4;\n      let on = 0;\n      for (let j = 0; j < 4; j++) if (st[engine.cEdge[base + j]] === ON) on++;\n      if (on !== want) return false;\n    }\n    return true;\n  }\n\n  function pick() {\n    for (let v = 0; v < DOT_COUNT; v++) {\n      const base = v * 4,\n        n = engine.vDeg[v];\n      let on = 0,\n        unkE = -1;\n      for (let j = 0; j < n; j++) {\n        const e = engine.vEdge[base + j];\n        if (st[e] === ON) on++;\n        else if (st[e] === UNK && unkE < 0) unkE = e;\n      }\n      if (on === 1 && unkE >= 0) return unkE;\n    }\n    let best = -1,\n      bestScore = 9;\n    for (let k = 0; k < CELL_COUNT; k++) {\n      if (clues[k] < 0) continue;\n      const base = k * 4;\n      let unk = 0,\n        p = -1;\n      for (let j = 0; j < 4; j++) {\n        const e = engine.cEdge[base + j];\n        if (st[e] === UNK) {\n          unk++;\n          p = e;\n        }\n      }\n      if (unk > 0 && unk < bestScore) {\n        bestScore = unk;\n        best = p;\n      }\n    }\n    if (best >= 0) return best;\n    for (let i = 0; i < EDGE_COUNT; i++) if (st[i] === UNK) return i;\n    return -1;\n  }\n\n  let count = 0,\n    limit = 2,\n    nodes = 0,\n    budget = 0,\n    aborted = false,\n    solution = null;\n  function found() {\n    count++;\n    if (!solution) {\n      solution = st.slice();\n      for (let i = 0; i < EDGE_COUNT; i++) if (solution[i] === UNK) solution[i] = OFF;\n    }\n  }\n\n  /* cy0 is the cycle count from *before* the parent placed its edge. Reading\n     cycleFlag on entry instead would miss a loop closed by that very edge,\n     and the finished solution would be thrown away unexamined. */\n  function rec(cy0) {\n    if (count >= limit || aborted) return;\n    if (++nodes > budget) {\n      aborted = true;\n      return;\n    }\n    const cy = cy0 === undefined ? cycleFlag : cy0;\n    if (!propagate()) return;\n    if (cycleFlag > cy) {\n      if (verify()) found();\n      return;\n    }\n    const e = pick();\n    if (e < 0) {\n      // every edge decided: judge the board as it stands\n      if (verify()) found();\n      return;\n    }\n    for (let v = 0; v < 2; v++) {\n      const tm = trailTop,\n        um = utop,\n        cf = cycleFlag;\n      setEdge(e, v === 0 ? ON : OFF);\n      rec(cf);\n      clearQueue();\n      while (utop > um) {\n        const big = utrail[--utop],\n          small = utrail[--utop];\n        usize[big] -= usize[small];\n        parent[small] = small;\n      }\n      while (trailTop > tm) st[trail[--trailTop]] = UNK;\n      cycleFlag = cf;\n      if (count >= limit || aborted) return;\n    }\n  }\n\n  function snap() {\n    const s = st.slice();\n    for (let i = 0; i < EDGE_COUNT; i++) if (s[i] === UNK) s[i] = OFF;\n    return s;\n  }\n\n  /* Deductions that follow from the clue numbers alone, so they only need\n     applying once at the start rather than on every propagation pass.\n     These are the standard published Slitherlink patterns for touching 3s. */\n  function clueRules() {\n    const { R, C, H, V } = engine;\n    const at = (r, c) => (r < 0 || c < 0 || r >= R || c >= C ? -1 : clues[r * C + c]);\n    for (let r = 0; r < R; r++)\n      for (let c = 0; c < C; c++) {\n        if (clues[r * C + c] !== 3) continue;\n\n        // two 3s side by side: the shared edge and both outer edges are drawn,\n        // and the shared edge cannot continue past either end\n        if (at(r, c + 1) === 3) {\n          if (!setEdge(V(r, c), ON)) return false;\n          if (!setEdge(V(r, c + 1), ON)) return false;\n          if (!setEdge(V(r, c + 2), ON)) return false;\n          if (r > 0 && !setEdge(V(r - 1, c + 1), OFF)) return false;\n          if (r + 1 < R && !setEdge(V(r + 1, c + 1), OFF)) return false;\n        }\n        if (at(r + 1, c) === 3) {\n          if (!setEdge(H(r, c), ON)) return false;\n          if (!setEdge(H(r + 1, c), ON)) return false;\n          if (!setEdge(H(r + 2, c), ON)) return false;\n          if (c > 0 && !setEdge(H(r + 1, c - 1), OFF)) return false;\n          if (c + 1 < C && !setEdge(H(r + 1, c + 1), OFF)) return false;\n        }\n\n        // 3s touching only at a corner: each one's two far edges are drawn\n        if (at(r + 1, c + 1) === 3) {\n          if (!setEdge(H(r, c), ON)) return false;\n          if (!setEdge(V(r, c), ON)) return false;\n          if (!setEdge(H(r + 2, c + 1), ON)) return false;\n          if (!setEdge(V(r + 1, c + 2), ON)) return false;\n        }\n        if (at(r + 1, c - 1) === 3) {\n          if (!setEdge(H(r, c), ON)) return false;\n          if (!setEdge(V(r, c + 1), ON)) return false;\n          if (!setEdge(H(r + 2, c - 1), ON)) return false;\n          if (!setEdge(V(r + 1, c - 1), ON)) return false;\n        }\n      }\n    return true;\n  }\n\n  /* preset: an array of ON/OFF/UNK asserted before the search starts, so a\n     part-finished board can be tested for consistency. */\n  function solve(cl, lim, bud, preset) {\n    clues = cl;\n    st.fill(UNK);\n    trailTop = 0;\n    utop = 0;\n    cycleFlag = 0;\n    for (let v = 0; v < DOT_COUNT; v++) {\n      parent[v] = v;\n      usize[v] = 1;\n    }\n    qh = qt = 0;\n    inQ.fill(0);\n    limit = lim || 2;\n    budget = bud || 200000;\n    nodes = 0;\n    aborted = false;\n    count = 0;\n    solution = null;\n    for (let v = 0; v < DOT_COUNT; v++) pushV(v);\n    for (let k = 0; k < CELL_COUNT; k++) pushC(k);\n    /* The touching-3s patterns were tried here and removed. They are sound and\n       cut nodes ~1.5x on average, but on some boards they wrecked the branching\n       order: one 8x8 went from 3,553 nodes to over 8,000,000. Average gains are\n       not worth a tail that turns a solvable puzzle into a timeout. */\n    if (preset) {\n      for (let i = 0; i < EDGE_COUNT; i++) {\n        const p = preset[i];\n        if (p !== ON && p !== OFF) continue;\n        if (!setEdge(i, p)) {\n          clearQueue();\n          return { count: 0, solution: null, aborted: false, nodes: 0 };\n        }\n      }\n      // a preset that already closes a loop can't be extended, so judge it as it stands\n      if (cycleFlag > 0) {\n        if (propagate() && verify()) {\n          count = 1;\n          solution = snap();\n        }\n        clearQueue();\n        return { count, solution, aborted: false, nodes: 0 };\n      }\n    }\n    rec();\n    return { count, solution, aborted, nodes };\n  }\n  return { solve };\n}\n\n/* ============================================================\n   2b. SAT — a small CDCL solver, and Slitherlink expressed for it\n\n   Counting solutions is the expensive half of making a puzzle, and the\n   hand-written search above cannot finish it much past 14x14. The same\n   question posed as CNF is settled in milliseconds, so uniqueness goes\n   through here instead.\n\n   Literals are encoded as 2*v for \"v true\" and 2*v+1 for \"v false\",\n   with variables numbered from 0.\n   ============================================================ */\nfunction SatSolver(nVars) {\n  const NEG = l => l ^ 1,\n    VAR = l => l >> 1;\n  let clauses = []; // each: array of literals\n  const watches = []; // per literal: clause indices\n  for (let i = 0; i < nVars * 2; i++) watches.push([]);\n  const value = new Int8Array(nVars); // 0 unknown, 1 true, -1 false\n  const level = new Int32Array(nVars);\n  const reason = new Int32Array(nVars).fill(-1);\n  const activity = new Float64Array(nVars);\n  const phase = new Int8Array(nVars);\n  const trail = new Int32Array(nVars);\n  let qhead = 0,\n    tsize = 0;\n  const trailLim = [];\n  let bump = 1,\n    conflicts = 0,\n    ok = true;\n\n  const litValue = l => {\n    const v = value[VAR(l)];\n    if (v === 0) return 0;\n    return l & 1 ? -v : v;\n  };\n\n  function enqueue(l, from) {\n    const v = VAR(l);\n    value[v] = l & 1 ? -1 : 1;\n    level[v] = trailLim.length;\n    reason[v] = from === undefined ? -1 : from;\n    trail[tsize++] = l;\n  }\n\n  function addClause(lits) {\n    if (!ok) return false;\n    const seen = new Set();\n    let out = [];\n    for (const l of lits) {\n      if (seen.has(NEG(l))) return true; // tautology\n      if (seen.has(l)) continue;\n      seen.add(l);\n      out.push(l);\n    }\n    /* Clauses are only ever added at level 0. Watching a literal that is\n       already false there breaks the watch invariant and the clause never\n       fires again - which silently let the same solution be counted twice. */\n    if (trailLim.length === 0) {\n      for (const l of out) if (litValue(l) > 0) return true; // already satisfied\n      out = out.filter(l => litValue(l) === 0);\n    }\n    if (!out.length) {\n      ok = false;\n      return false;\n    }\n    if (out.length === 1) {\n      const v = litValue(out[0]);\n      if (v < 0) {\n        ok = false;\n        return false;\n      }\n      if (v === 0) enqueue(out[0]);\n      return true;\n    }\n    const ci = clauses.length;\n    clauses.push(out);\n    watches[NEG(out[0])].push(ci);\n    watches[NEG(out[1])].push(ci);\n    return true;\n  }\n\n  /* two-watched-literal propagation */\n  function propagate() {\n    while (qhead < tsize) {\n      const l = trail[qhead++];\n      const ws = watches[l];\n      let keep = 0;\n      for (let wi = 0; wi < ws.length; wi++) {\n        const ci = ws[wi];\n        const c = clauses[ci];\n        const other = NEG(l);\n        if (c[0] === other) {\n          c[0] = c[1];\n          c[1] = other;\n        }\n        if (litValue(c[0]) > 0) {\n          ws[keep++] = ci;\n          continue;\n        }\n        let moved = false;\n        for (let k = 2; k < c.length; k++) {\n          if (litValue(c[k]) >= 0) {\n            c[1] = c[k];\n            c[k] = other;\n            watches[NEG(c[1])].push(ci);\n            moved = true;\n            break;\n          }\n        }\n        if (moved) continue;\n        ws[keep++] = ci;\n        if (litValue(c[0]) < 0) {\n          // conflict\n          for (let k = wi + 1; k < ws.length; k++) ws[keep++] = ws[k];\n          ws.length = keep;\n          return ci;\n        }\n        enqueue(c[0], ci);\n      }\n      ws.length = keep;\n    }\n    return -1;\n  }\n\n  /* first-UIP conflict analysis */\n  const seenV = new Uint8Array(nVars);\n  function analyze(confl) {\n    const learnt = [0]; // slot 0 filled at the end\n    let counter = 0,\n      p = -1,\n      idx = tsize - 1;\n    const touched = [];\n    do {\n      const c = clauses[confl];\n      for (let j = p === -1 ? 0 : 1; j < c.length; j++) {\n        const q = c[j],\n          v = VAR(q);\n        if (seenV[v] || level[v] === 0) continue;\n        seenV[v] = 1;\n        touched.push(v);\n        activity[v] += bump;\n        if (level[v] >= trailLim.length) counter++;\n        else learnt.push(q);\n      }\n      while (!seenV[VAR(trail[idx])]) idx--;\n      p = trail[idx--];\n      seenV[VAR(p)] = 0;\n      confl = reason[VAR(p)];\n      counter--;\n    } while (counter > 0);\n    learnt[0] = NEG(p);\n    let back = 0;\n    if (learnt.length > 1) {\n      let best = 1;\n      for (let i = 2; i < learnt.length; i++)\n        if (level[VAR(learnt[i])] > level[VAR(learnt[best])]) best = i;\n      const t = learnt[1];\n      learnt[1] = learnt[best];\n      learnt[best] = t;\n      back = level[VAR(learnt[1])];\n    }\n    for (const v of touched) seenV[v] = 0;\n    return { learnt, back };\n  }\n\n  function cancelUntil(lvl) {\n    if (trailLim.length <= lvl) return;\n    const lim = trailLim[lvl];\n    for (let i = tsize - 1; i >= lim; i--) {\n      const v = VAR(trail[i]);\n      phase[v] = value[v] > 0 ? 1 : -1;\n      value[v] = 0;\n      reason[v] = -1;\n    }\n    tsize = lim;\n    qhead = lim;\n    trailLim.length = lvl;\n  }\n\n  function pickBranch() {\n    let best = -1,\n      bestA = -1;\n    for (let v = 0; v < nVars; v++) {\n      if (value[v] !== 0) continue;\n      if (activity[v] > bestA) {\n        bestA = activity[v];\n        best = v;\n      }\n    }\n    if (best < 0) return -1;\n    return phase[best] < 0 ? best * 2 + 1 : best * 2;\n  }\n\n  /* budget is a conflict limit; returns \"sat\" | \"unsat\" | \"budget\" */\n  function solve(budget) {\n    if (!ok) return \"unsat\";\n    let used = 0;\n    let restart = 100;\n    for (;;) {\n      const confl = propagate();\n      if (confl >= 0) {\n        conflicts++;\n        used++;\n        if (trailLim.length === 0) {\n          ok = false;\n          return \"unsat\";\n        }\n        const { learnt, back } = analyze(confl);\n        cancelUntil(back);\n        if (learnt.length === 1) enqueue(learnt[0]);\n        else {\n          const ci = clauses.length;\n          clauses.push(learnt);\n          watches[NEG(learnt[0])].push(ci);\n          watches[NEG(learnt[1])].push(ci);\n          enqueue(learnt[0], ci);\n        }\n        bump *= 1.05;\n        if (bump > 1e100) {\n          for (let v = 0; v < nVars; v++) activity[v] *= 1e-100;\n          bump *= 1e-100;\n        }\n        if (budget && used >= budget) return \"budget\";\n        if (used >= restart) {\n          restart += Math.max(100, restart >> 1);\n          cancelUntil(0);\n        }\n      } else {\n        const l = pickBranch();\n        if (l < 0) return \"sat\";\n        trailLim.push(tsize);\n        enqueue(l);\n      }\n    }\n  }\n\n  return {\n    addClause,\n    solve,\n    reset() {\n      cancelUntil(0);\n    },\n    model() {\n      const m = new Uint8Array(nVars);\n      for (let v = 0; v < nVars; v++) m[v] = value[v] > 0 ? 1 : 0;\n      return m;\n    },\n    get ok() {\n      return ok;\n    },\n    get conflicts() {\n      return conflicts;\n    },\n  };\n}\n\n/* ---- Slitherlink as CNF ----\n   one variable per edge; each clue is exactly-k of its four edges; each dot\n   has degree 0 or 2. \"exactly one loop\" is not expressible here and is\n   handled by refutation in satCount below. */\nfunction satClauses(engine, clues) {\n  const out = [];\n  const P = e => e * 2,\n    N = e => e * 2 + 1;\n  for (let k = 0; k < engine.NC; k++) {\n    const want = clues[k];\n    if (want < 0) continue;\n    const es = [\n      engine.cEdge[k * 4],\n      engine.cEdge[k * 4 + 1],\n      engine.cEdge[k * 4 + 2],\n      engine.cEdge[k * 4 + 3],\n    ];\n    if (want === 0) {\n      for (const e of es) out.push([N(e)]);\n      continue;\n    }\n    if (want === 4) {\n      for (const e of es) out.push([P(e)]);\n      continue;\n    }\n    // at most `want`: no want+1 of them true\n    combos(es, want + 1, c => out.push(c.map(N)));\n    // at least `want`: no 4-want+1 of them false\n    combos(es, 4 - want + 1, c => out.push(c.map(P)));\n  }\n  for (let v = 0; v < engine.VC; v++) {\n    const n = engine.vDeg[v];\n    const es = [];\n    for (let j = 0; j < n; j++) es.push(engine.vEdge[v * 4 + j]);\n    // never degree 1: if one is drawn another must be\n    for (const e of es) out.push([N(e)].concat(es.filter(o => o !== e).map(P)));\n    // at most two\n    combos(es, 3, c => out.push(c.map(N)));\n  }\n  const any = [];\n  for (let e = 0; e < engine.E; e++) any.push(P(e));\n  out.push(any); // the empty board is not a solution\n  return out;\n}\nfunction combos(arr, k, fn) {\n  if (k > arr.length) return;\n  const idx = [];\n  (function rec(start) {\n    if (idx.length === k) {\n      fn(idx.map(i => arr[i]));\n      return;\n    }\n    for (let i = start; i < arr.length; i++) {\n      idx.push(i);\n      rec(i + 1);\n      idx.pop();\n    }\n  })(0);\n}\n\n/* Components of the drawn edges, so a model made of several loops can be\n   refuted rather than accepted. */\nfunction edgeLoops(engine, on) {\n  const adj = new Map();\n  for (const e of on) {\n    for (const v of [engine.ea[e], engine.eb[e]]) {\n      let a = adj.get(v);\n      if (!a) {\n        a = [];\n        adj.set(v, a);\n      }\n      a.push(e);\n    }\n  }\n  const seen = new Set(),\n    comps = [];\n  for (const s of on) {\n    if (seen.has(s)) continue;\n    const stack = [s],\n      comp = [];\n    seen.add(s);\n    while (stack.length) {\n      const e = stack.pop();\n      comp.push(e);\n      for (const v of [engine.ea[e], engine.eb[e]])\n        for (const f of adj.get(v) || [])\n          if (!seen.has(f)) {\n            seen.add(f);\n            stack.push(f);\n          }\n    }\n    comps.push(comp);\n  }\n  return comps;\n}\n\n/* Count solutions up to `limit`. Same contract as the older solver:\n   {count, solution, aborted}. `budget` is a conflict allowance. */\n/* The hand-written search is quicker on the many easy checks; SAT is the one\n   that can finish the hard ones. Ask the cheap one first and fall back. */\nfunction countSolutions(CELL, engine, clues, limit, fastBudget, satBudget) {\n  const fast = CELL.solve(clues, limit, fastBudget);\n  if (!fast.aborted) return fast;\n  return satCount(engine, clues, limit, satBudget);\n}\n\nfunction satCount(engine, clues, limit, budget) {\n  const CELL = SatSolver(engine.E);\n  for (const c of satClauses(engine, clues))\n    if (!CELL.addClause(c)) return { count: 0, solution: null, aborted: false, nodes: 0 };\n  limit = limit || 2;\n  let count = 0,\n    solution = null,\n    spent = 0,\n    rounds = 0;\n  const cap = budget || 200000;\n  /* Each refuted subloop costs a round but may cost no conflicts at all, so\n     rounds are bounded separately; without this a board with many small loops\n     spins forever adding clauses. */\n  const maxRounds = Math.max(2000, engine.E * 8);\n  for (;;) {\n    if (count >= limit) break;\n    if (++rounds > maxRounds) return { count, solution, aborted: true, nodes: CELL.conflicts };\n    CELL.reset();\n    const left = cap - spent;\n    if (left <= 0) return { count, solution, aborted: true, nodes: CELL.conflicts };\n    const r = CELL.solve(left);\n    spent = CELL.conflicts;\n    if (r === \"budget\") return { count, solution, aborted: true, nodes: CELL.conflicts };\n    if (r === \"unsat\") break;\n    const m = CELL.model();\n    CELL.reset(); // back to level 0 before adding clauses: a unit clause\n    // added deeper would be undone by the next backtrack and\n    // the same solution could then be found twice\n    const on = [];\n    for (let e = 0; e < engine.E; e++) if (m[e]) on.push(e);\n    const comps = edgeLoops(engine, on);\n    if (comps.length > 1) {\n      // several separate loops: forbid the smallest and look again\n      let small = comps[0];\n      for (const c of comps) if (c.length < small.length) small = c;\n      CELL.addClause(small.map(e => e * 2 + 1));\n      continue;\n    }\n    count++;\n    if (!solution) {\n      solution = new Uint8Array(engine.E);\n      for (let e = 0; e < engine.E; e++) solution[e] = m[e] ? ON : OFF;\n    }\n    CELL.addClause([...Array(engine.E).keys()].map(e => (m[e] ? e * 2 + 1 : e * 2)));\n  }\n  return { count, solution, aborted: false, nodes: CELL.conflicts };\n}\n\n/* ============================================================\n   3. Generator — a random simply connected blob makes the loop\n   ============================================================ */\nfunction shuffle(a) {\n  for (let i = a.length - 1; i > 0; i--) {\n    const j = (Math.random() * (i + 1)) | 0;\n    [a[i], a[j]] = [a[j], a[i]];\n  }\n  return a;\n}\n\nfunction regionValid(R, C, inside) {\n  const N = R * C;\n  let start = -1,\n    size = 0;\n  for (let i = 0; i < N; i++)\n    if (inside[i]) {\n      if (start < 0) start = i;\n      size++;\n    }\n  if (!size || size === N) return false;\n  const seen = new Uint8Array(N);\n  let st = [start];\n  seen[start] = 1;\n  let cnt = 1;\n  while (st.length) {\n    const k = st.pop(),\n      r = (k / C) | 0,\n      c = k % C;\n    if (r > 0 && inside[k - C] && !seen[k - C]) {\n      seen[k - C] = 1;\n      cnt++;\n      st.push(k - C);\n    }\n    if (r < R - 1 && inside[k + C] && !seen[k + C]) {\n      seen[k + C] = 1;\n      cnt++;\n      st.push(k + C);\n    }\n    if (c > 0 && inside[k - 1] && !seen[k - 1]) {\n      seen[k - 1] = 1;\n      cnt++;\n      st.push(k - 1);\n    }\n    if (c < C - 1 && inside[k + 1] && !seen[k + 1]) {\n      seen[k + 1] = 1;\n      cnt++;\n      st.push(k + 1);\n    }\n  }\n  if (cnt !== size) return false;\n  const PR = R + 2,\n    PC = C + 2,\n    PN = PR * PC,\n    out = new Uint8Array(PN);\n  let total = 0;\n  for (let r = 0; r < PR; r++)\n    for (let c = 0; c < PC; c++) {\n      const p = r * PC + c;\n      const o =\n        r === 0 || c === 0 || r === PR - 1 || c === PC - 1\n          ? 1\n          : inside[(r - 1) * C + (c - 1)]\n            ? 0\n            : 1;\n      out[p] = o;\n      if (o) total++;\n    }\n  const s2 = new Uint8Array(PN);\n  st = [0];\n  s2[0] = 1;\n  let c2 = 1;\n  while (st.length) {\n    const p = st.pop(),\n      r = (p / PC) | 0,\n      c = p % PC;\n    if (r > 0 && out[p - PC] && !s2[p - PC]) {\n      s2[p - PC] = 1;\n      c2++;\n      st.push(p - PC);\n    }\n    if (r < PR - 1 && out[p + PC] && !s2[p + PC]) {\n      s2[p + PC] = 1;\n      c2++;\n      st.push(p + PC);\n    }\n    if (c > 0 && out[p - 1] && !s2[p - 1]) {\n      s2[p - 1] = 1;\n      c2++;\n      st.push(p - 1);\n    }\n    if (c < PC - 1 && out[p + 1] && !s2[p + 1]) {\n      s2[p + 1] = 1;\n      c2++;\n      st.push(p + 1);\n    }\n  }\n  if (c2 !== total) return false;\n  const at = (r, c) => (r < 0 || c < 0 || r >= R || c >= C ? 0 : inside[r * C + c]);\n  for (let r = 1; r < R; r++)\n    for (let c = 1; c < C; c++) {\n      const nw = at(r - 1, c - 1),\n        ne = at(r - 1, c),\n        sw = at(r, c - 1),\n        se = at(r, c);\n      if (nw && se && !ne && !sw) return false;\n      if (ne && sw && !nw && !se) return false;\n    }\n  return true;\n}\nfunction perimeter(R, C, inside) {\n  let p = 0;\n  const at = (r, c) => (r < 0 || c < 0 || r >= R || c >= C ? 0 : inside[r * C + c]);\n  for (let r = 0; r < R; r++)\n    for (let c = 0; c < C; c++) {\n      if (!inside[r * C + c]) continue;\n      if (!at(r - 1, c)) p++;\n      if (!at(r + 1, c)) p++;\n      if (!at(r, c - 1)) p++;\n      if (!at(r, c + 1)) p++;\n    }\n  return p;\n}\nfunction growLoop(R, C) {\n  const N = R * C,\n    inside = new Uint8Array(N);\n  inside[(R >> 1) * C + (C >> 1)] = 1;\n  const target = Math.max(2, Math.round(N * (0.3 + Math.random() * 0.2)));\n  let size = 1,\n    guard = 0;\n  const growGuard = Math.min(N * 200, 200000);\n  while (size < target && guard++ < growGuard) {\n    const k = (Math.random() * N) | 0;\n    if (inside[k]) continue;\n    const r = (k / C) | 0,\n      c = k % C;\n    let t = false;\n    if (r > 0 && inside[k - C]) t = true;\n    if (r < R - 1 && inside[k + C]) t = true;\n    if (c > 0 && inside[k - 1]) t = true;\n    if (c < C - 1 && inside[k + 1]) t = true;\n    if (!t) continue;\n    inside[k] = 1;\n    if (regionValid(R, C, inside)) size++;\n    else inside[k] = 0;\n  }\n  let per = perimeter(R, C, inside);\n  // regionValid is O(N), so the tempering pass is capped to stay usable on big sheets\n  for (let t = 0, n = Math.min(N * 50, 60000); t < n; t++) {\n    const k = (Math.random() * N) | 0,\n      was = inside[k];\n    inside[k] = was ? 0 : 1;\n    if (!regionValid(R, C, inside)) {\n      inside[k] = was;\n      continue;\n    }\n    const np = perimeter(R, C, inside);\n    if (np > per || Math.random() < 0.12) per = np;\n    else inside[k] = was;\n  }\n  return inside;\n}\nfunction loopEdges(engine, inside) {\n  const { R, C } = engine,\n    at = (r, c) => (r < 0 || c < 0 || r >= R || c >= C ? 0 : inside[r * C + c]);\n  const st = new Uint8Array(engine.E);\n  for (let r = 0; r <= R; r++)\n    for (let c = 0; c < C; c++) st[engine.H(r, c)] = at(r - 1, c) !== at(r, c) ? ON : OFF;\n  for (let r = 0; r < R; r++)\n    for (let c = 0; c <= C; c++) st[engine.V(r, c)] = at(r, c - 1) !== at(r, c) ? ON : OFF;\n  return st;\n}\nfunction cluesFromLoop(engine, st) {\n  const out = new Int8Array(engine.NC);\n  for (let k = 0; k < engine.NC; k++) {\n    let n = 0;\n    for (let j = 0; j < 4; j++) if (st[engine.cEdge[k * 4 + j]] === ON) n++;\n    out[k] = n;\n  }\n  return out;\n}\n\nconst DIFFS = {\n  gentle: { label: \"Gentle\", frac: 0.55, base: 1200 },\n  standard: { label: \"Standard\", frac: 0.85, base: 4000 },\n  tough: { label: \"Tough\", frac: 1.0, base: 15000 },\n  // keeps sweeping until no single clue can come out without costing the\n  // puzzle its one and only solution\n  maximal: { label: \"Maximal\", frac: 1.0, base: 60000, minimal: true },\n};\n\n// Chunked so the browser keeps painting while it searches.\nfunction generateAsync(R, C, diffKey, onProgress) {\n  return new Promise((resolve, reject) => {\n    const engine = Engine(R, C),\n      CELL = Solver(engine),\n      d = DIFFS[diffKey] || DIFFS.standard;\n    // The old formula divided by cell count, so bigger sheets got a smaller\n    // budget and every removal check timed out — leaving every clue in place.\n    // Take whichever is larger so small grids stay generous and big ones work.\n    const fastBudget = Math.max(1000, d.base, Math.round((d.base * 100) / engine.NC)); // search nodes\n    const budget = Math.max(2000, Math.round(d.base / 8)); // SAT conflicts\n    // Proving a full clue set unique is the expensive half of the job, so cap\n    // it per attempt and retry rather than blocking the page on one candidate.\n    /* Measured: 16x16 needs ~85k nodes to prove a full clue set unique, 18x18\n       about 620k. The old 150k ceiling rejected nearly every candidate loop\n       past 16, so large sheets retried forever. */\n    const seedBudget = Math.max(20000, engine.NC * 40);\n    const fastSeed = Math.max(60000, engine.NC * 400);\n    const shapeMs = engine.NC > 900 ? 26 : 1e9;\n    const attemptCap = engine.NC > 900 ? 400 : 40;\n    const MAXB = 200000; // ceiling when maximal has to prove a hard case\n    let phase = 0,\n      attempt = 0,\n      clues = null,\n      order = null,\n      i = 0,\n      stopAt = 0;\n    let pass = 1,\n      removed = 0,\n      stuck = [],\n      curBudget = budget;\n    let kept = 0,\n      removedAll = 0;\n\n    const remaining = () => {\n      const a = [];\n      for (let k = 0; k < engine.NC; k++) if (clues[k] >= 0) a.push(k);\n      return a;\n    };\n    function done() {\n      let given = 0;\n      for (let k = 0; k < engine.NC; k++) if (clues[k] >= 0) given++;\n      resolve({\n        R,\n        C,\n        clues: Array.from(clues),\n        given,\n        minimal: !!d.minimal,\n        inconclusive: d.minimal ? stuck.length : 0,\n        passes: pass,\n      });\n    }\n\n    function step() {\n      const t0 = performance.now();\n      while (performance.now() - t0 < 26) {\n        if (phase === 0) {\n          if (attempt++ > attemptCap) {\n            reject(\n              new Error(\n                `Gave up after ${attemptCap} attempts on ${R}×${C}. Big puzzles build far quicker in slink-gen — generate one there and import it.`,\n              ),\n            );\n            return;\n          }\n          if (onProgress) onProgress({ stage: \"loop\", attempt, R, C });\n          const loop = loopEdges(engine, growLoop(R, C, shapeMs));\n          const full = cluesFromLoop(engine, loop);\n          const chk = countSolutions(CELL, engine, full, 2, fastSeed, seedBudget);\n          if (chk.count === 1 && !chk.aborted) {\n            clues = Int8Array.from(full);\n            kept = 0;\n            for (let q = 0; q < engine.NC; q++) if (clues[q] >= 0) kept++;\n            order = shuffle([...Array(engine.NC).keys()]);\n            stopAt = Math.round(engine.NC * d.frac);\n            i = 0;\n            phase = 1;\n          }\n        } else {\n          if (i >= stopAt) {\n            /* One complete pass already leaves a minimal set. Dropping a clue\n               can only ever add solutions, so a clue that was conclusively\n               kept stays unremovable however much is taken away afterwards.\n               The only unfinished business is checks that ran out of budget,\n               so re-test exactly those, with more room each time. */\n            if (d.minimal && stuck.length && curBudget < MAXB) {\n              curBudget = Math.min(MAXB, curBudget * 6);\n              order = stuck;\n              stopAt = order.length;\n              i = 0;\n              stuck = [];\n              pass++;\n              continue;\n            }\n            done();\n            return;\n          }\n          const k = order[i++],\n            keep = clues[k];\n          clues[k] = -1;\n          const res = countSolutions(CELL, engine, clues, 2, fastBudget, curBudget);\n          if (res.count !== 1 || res.aborted) {\n            clues[k] = keep;\n            if (res.aborted) stuck.push(k); // unresolved, worth another look\n          } else {\n            removed++;\n            removedAll++;\n            kept--;\n          }\n          if (onProgress)\n            onProgress({\n              stage: \"trim\",\n              frac: i / stopAt,\n              pass,\n              checked: i,\n              total: stopAt,\n              kept,\n              removed: removedAll,\n              hard: curBudget > budget,\n              minimal: !!d.minimal,\n            });\n        }\n      }\n      setTimeout(step, 0);\n    }\n    step();\n  });\n}\n\n\n/* seedable RNG — the engine calls Math.random, so we swap it out wholesale */\nfunction mulberry32(a){\n  return function(){\n    a|=0; a=a+0x6D2B79F5|0;\n    let t=Math.imul(a^a>>>15,1|a);\n    t=t+Math.imul(t^t>>>7,61|t)^t;\n    return ((t^t>>>14)>>>0)/4294967296;\n  };\n}\n\n/* The browser build slices its work into 26ms chunks and hands control back\n   to the page between them. Off the page there is nothing to stay responsive\n   for, so this runs the identical algorithm straight through. */\nfunction generateSync(R,C,diffKey,scale,onTick,stopping){\n  const g=Engine(R,C), S=Solver(g), d=DIFFS[diffKey]||DIFFS.standard;\n  scale=scale||1;\n  const fastBudget=Math.max(1000,d.base,Math.round(d.base*100/g.NC))*scale; // search nodes\n  const budget=Math.max(2000,Math.round(d.base/8))*scale;                   // SAT conflicts\n  const fastSeed=Math.max(60000,g.NC*400)*scale;\n  const seedBudget=Math.max(20000,g.NC*40)*scale;\n  const MAXB=200000*scale;\n  const LOOP_MS=180000*scale;         // fail with an explanation, not forever\n\n  let clues=null,attempt=0;\n  const tLoop=Date.now();\n  for(;;){\n    attempt++;\n    if(onTick)onTick({stage:\"loop\",attempt});\n    const full=cluesFromLoop(g,loopEdges(g,growLoop(R,C)));\n    const chk=countSolutions(S,g,full,2,fastSeed,seedBudget);\n    if(chk.count===1&&!chk.aborted){ clues=Int8Array.from(full); break; }\n    if(stopping&&stopping())\n      throw new Error(\"stopped before a loop was settled — nothing to save yet\");\n    if(Date.now()-tLoop>LOOP_MS)\n      throw new Error(`${R}x${C} is too big for this generator to certify: after `\n        +`${attempt} attempts it could not prove any clue set has just one solution. `\n        +`Try a smaller grid, or --scale 4 to allow a longer search.`);\n  }\n  return trim(g,S,d,clues,budget,MAXB,R,C,diffKey,onTick,fastBudget,stopping);\n}\n\nfunction trim(g,S,d,clues,budget,MAXB,R,C,diffKey,onTick,fastBudget,stopping){\n  let order=shuffle([...Array(g.NC).keys()]);\n  let stopAt=Math.round(g.NC*d.frac);\n  let curBudget=budget,pass=1,stuck=[],checked=0;\n  for(;;){\n    for(let i=0;i<stopAt;i++){\n      if(stopping&&stopping())return finish(true);\n      const k=order[i],keep=clues[k];\n      if(keep<0)continue;\n      clues[k]=-1;\n      const res=countSolutions(S,g,clues,2,fastBudget,curBudget);\n      if(res.count!==1||res.aborted){ clues[k]=keep; if(res.aborted)stuck.push(k); }\n      if(onTick&&(++checked&15)===0)\n        onTick({stage:\"trim\",checked,left:[...clues].filter(v=>v>=0).length});\n    }\n    /* One complete pass already leaves a minimal set: dropping a clue can only\n       add solutions, so anything conclusively kept stays unremovable no matter\n       what is taken out later. Only the checks that ran out of budget are\n       still open, so re-test exactly those with more room. */\n    if(d.minimal&&stuck.length&&curBudget<MAXB){\n      curBudget=Math.min(MAXB,curBudget*6);\n      order=stuck; stopAt=order.length; stuck=[]; pass++;\n      continue;\n    }\n    break;\n  }\n  return finish(false);\n\n  function finish(stopped){\n    let given=0; for(let k=0;k<g.NC;k++)if(clues[k]>=0)given++;\n    return {R,C,diff:diffKey,given,minimal:!!d.minimal&&!stopped,stopped,\n            inconclusive:d.minimal?stuck.length:0,passes:pass,clues:Array.from(clues)};\n  }\n}\n\n\n\n{\n  const {parentPort,workerData}=require(\"node:worker_threads\");\n  const {R,C,diff,scale,seed}=workerData;\n  Math.random=mulberry32(seed);\n  let stopFlag=false;\n  parentPort.on(\"message\",msg=>{\n    if(msg.type===\"stop\"){ stopFlag=true; return; }\n    if(msg.type!==\"job\")return;\n    try{\n      const t0=Date.now();\n      const puz=generateSync(R,C,diff,scale,\n        info=>parentPort.postMessage({type:\"tick\",info}), ()=>stopFlag);\n      puz.ms=Date.now()-t0;\n      parentPort.postMessage({type:\"done\",index:msg.index,puz});\n    }catch(e){\n      parentPort.postMessage({type:\"fail\",index:msg.index,error:e.message});\n    }\n  });\n  parentPort.postMessage({type:\"ready\"});\n}\n";


/* ---------------- args ---------------- */
const DEFAULTS={rows:10,cols:10,count:1,difficulty:"standard",
  out:"slitherlink-pack.json",workers:0,seed:0,scale:1,quiet:false,ask:false,ui:false,serve:false,port:8080,page:"",data:"",noopen:false};

/* Double-clicking the binary gives no arguments and no way to pass any, so
   with a terminal attached and nothing specified we simply ask. readline
   handles line splitting, which a raw stdin listener does not when the
   answers arrive in a single chunk. */
let rl=null, lineQueue=[], lineWaiter=null, rlClosed=false;
const interactive=()=>!!(process.stdin.isTTY&&process.stdout.isTTY);

function ensureRl(){
  if(rl)return;
  const opts={input:process.stdin};
  // At a real terminal readline must own the output, otherwise nothing the
  // user types is echoed and they are answering blind.
  if(interactive()){ opts.output=process.stdout; opts.terminal=true; }
  rl=require("node:readline").createInterface(opts);
  rl.on("line",l=>{
    if(lineWaiter){ const w=lineWaiter; lineWaiter=null; w(l); }
    else lineQueue.push(l);
  });
  rl.on("close",()=>{
    rlClosed=true;
    if(lineWaiter){ const w=lineWaiter; lineWaiter=null; w(null); }
  });
}

function prompt(question,fallback){
  const dflt=String(fallback===undefined?"":fallback);
  ensureRl();
  // One path for both cases. rl.question is deliberately not used: with a
  // terminal it competes with the "line" listener, so answers typed ahead of
  // the next question are swallowed. Terminal mode still echoes what is typed.
  process.stdout.write(question+(fallback!==undefined?` [${fallback}] `:" "));
  return new Promise(resolve=>{
    const take=l=>{
      const v=(l==null?"":String(l).trim());
      if(l==null)process.stdout.write("\n");
      resolve(v===""?dflt:v);
    };
    if(lineQueue.length)return take(lineQueue.shift());
    if(rlClosed)return take(null);
    lineWaiter=take;
  });
}

async function askSettings(o){
  console.log("\nslink-gen "+VERSION+" — press Enter to accept the value in brackets.\n");
  const size=await prompt("Grid size (rows x cols):",`${o.rows}x${o.cols}`);
  const m=/^(\d+)\s*[x×]?\s*(\d+)?$/i.exec(size.trim());
  if(m){ o.rows=+m[1]; o.cols=m[2]?+m[2]:+m[1]; }
  const n=await prompt("How many puzzles:",o.count);
  if(Number.isFinite(+n)&&+n>0)o.count=Math.trunc(+n);
  const names=Object.keys(DIFFS);
  const d=await prompt(`Difficulty (${names.join(" / ")}):`,o.difficulty);
  if(DIFFS[d.toLowerCase()])o.difficulty=d.toLowerCase();
  const f=await prompt("Save to file:",o.out);
  if(f)o.out=f;
  console.log("");
  if(rl){ rl.close(); rl=null; }
  return o;
}

function parseArgs(argv){
  const o={...DEFAULTS};
  const alias={r:"rows",c:"cols",n:"count",d:"difficulty",o:"out",w:"workers",s:"seed",q:"quiet"};
  for(let i=0;i<argv.length;i++){
    let a=argv[i];
    if(a==="--help"||a==="-h"){o.help=true;continue;}
    if(a==="--version"||a==="-v"){o.version=true;continue;}
    if(!a.startsWith("-")){o._=(o._||[]).concat(a);continue;}
    a=a.replace(/^--?/,"");
    let val=null;
    const eq=a.indexOf("=");
    if(eq>0){val=a.slice(eq+1);a=a.slice(0,eq);}
    const key=alias[a]||a;
    if(!(key in DEFAULTS))throw new Error(
      `unknown option --${a}. This is slink-gen ${VERSION}; if you were told to `
      +`use --${a}, this copy is older than the instructions — download the `
      +`current slink-gen and replace it.`);
    if(key==="quiet"){o.quiet=true;continue;}
    if(key==="ask"){o.ask=true;continue;}
    if(key==="ui"){o.ui=true;continue;}
    if(key==="serve"){o.serve=true;continue;}
    if(key==="noopen"){o.noopen=true;continue;}
    if(val===null){val=argv[++i];}
    if(val===undefined)throw new Error(`--${a} needs a value`);
    const STRINGS={out:1,difficulty:1,page:1,data:1};   // these are paths/names, not numbers
    o[key]=STRINGS[key]?val:Number(val);
  }
  // a bare "12x8" is a friendly shorthand for --rows 12 --cols 8
  if(o._&&o._.length){
    const m=/^(\d+)\s*[x×]\s*(\d+)$/i.exec(o._[0]);
    if(m){o.rows=+m[1];o.cols=+m[2];}
    else throw new Error(`don't know what to do with "${o._[0]}"`);
  }
  return o;
}

const HELP=`slink-gen ${VERSION} — offline puzzle generator for the Slitherlink plot room

USAGE
  node slink-gen.js [SIZE] [options]

  SIZE may be given as 12x8, or with --rows and --cols.

OPTIONS
  -r, --rows N          rows in the grid            (default ${DEFAULTS.rows})
  -c, --cols N          columns in the grid         (default ${DEFAULTS.cols})
  -n, --count N         how many puzzles to build   (default ${DEFAULTS.count})
  -d, --difficulty NAME gentle | standard | tough | maximal
  -o, --out FILE        where to write the pack     (default ${DEFAULTS.out})
  -w, --workers N       CPU cores to use            (default: all of them)
  -s, --seed N          seed the RNG for repeatable packs
      --scale N         multiply the search budgets (slower, more thorough)
  -q, --quiet           only print the final line
      --ask             ask the settings as questions in the terminal
      --ui              open the browser UI (also the default with no options)
      --serve           run the room server (slink-server does this alone)
      --port N          port for --serve                (default 8080)
      --page FILE       which html to serve             (default: found nearby)
      --data FILE       where rooms are kept            (default slink-rooms.json)
  -h, --help            this text
  -v, --version

DIFFICULTY
  gentle    keeps most clues, gentle solving
  standard  a normal puzzle
  tough     one removal pass over every clue
  maximal   sweeps repeatedly until no clue can be removed without
            costing the puzzle its single solution. Much slower.

EXAMPLES
  node slink-gen.js 10x10
  node slink-gen.js 20x20 -d maximal -n 8 -o packs/big.json
  node slink-gen.js -r 15 -c 15 -d tough -n 50 -s 1234

The pack is a .json file. Open the plot room, choose "Import a pack…"
on the new-sheet card, and pick it.
`;

/* ---------------- terminal progress ---------------- */
const tty=process.stdout.isTTY;
function bar(frac,width){
  const full=Math.round(frac*width);
  return "█".repeat(full)+"░".repeat(width-full);
}
function fmt(ms){
  const s=Math.round(ms/1000);
  if(s<60)return s+"s";
  const m=Math.floor(s/60);
  return m+"m "+String(s%60).padStart(2,"0")+"s";
}

/* Runs the worker pool. hooks.onPuzzle(puz,doneCount) and hooks.onTick()
   report progress; both the terminal and the browser UI drive this. */
function runPool(opt,hooks){
  hooks=hooks||{};
  const cores=os.cpus().length||1;
  const want=opt.workers>0?opt.workers:cores;
  const nWorkers=Math.max(1,Math.min(want,opt.count>1?Math.min(opt.count,want):want));
  const seedBase=opt.seed||((Math.random()*1e9)|0);
  const results=new Array(opt.count).fill(null);
  const failures=[];
  let issued=0,finished=0,ticks=0;
  const byWorker=new Map();               // worker index -> its latest report
  const t0=Date.now();

  const pool=[];
  const done=new Promise(resolve=>{
    let live=0;
    const nextIndex=()=>{
      if(issued<opt.count)return issued++;
      // spare cores race a puzzle that is still running; first one home wins
      const pend=results.findIndex(r=>r===null);
      return pend>=0?pend:-1;
    };
    const feed=w=>{
      const idx=nextIndex();
      if(idx<0){ w.terminate(); if(--live===0)resolve(); return; }
      w.postMessage({type:"job",index:idx});
    };
    pool.length=0;
    for(let i=0;i<nWorkers;i++){
      const w=new Worker(WORKER_SRC,{eval:true,workerData:{
        R:opt.rows,C:opt.cols,diff:opt.difficulty,scale:opt.scale,seed:seedBase+i*7919}});
      live++; pool.push(w);
      w.on("message",m=>{
        if(m.type==="ready"){ feed(w); return; }
        if(m.type==="tick"){
          ticks++;
          if(m.info)byWorker.set(i,m.info);
          if(hooks.onTick)hooks.onTick(ticks,m.info); return; }
        if(m.type==="fail"){
          if(!results[m.index]){ failures.push(m.error); results[m.index]=undefined; finished++; }
          feed(w); return;
        }
        if(m.type==="done"){
          if(!results[m.index]){
            results[m.index]=m.puz; finished++;
            if(hooks.onPuzzle)hooks.onPuzzle(m.puz,finished);
          }
          feed(w);
        }
      });
      w.on("error",e=>{ failures.push(e.message); if(--live===0)resolve(); });
    }
  }).then(()=>({
    puzzles:results.filter(Boolean),failures,seedBase,nWorkers,cores,
    ms:Date.now()-t0,ticks:()=>ticks
  }));
  return {done,seedBase,nWorkers,cores,started:t0,
          /* ask the workers to wrap up: each keeps the clues it has already
             proved, so an interrupted run still yields real puzzles */
          stop(){ issued=opt.count; for(const w of pool)w.postMessage({type:"stop"}); },
          progress:()=>({finished,total:opt.count,ticks,ms:Date.now()-t0,
                         workers:[...byWorker.entries()].sort((a,b)=>a[0]-b[0])
                                  .map(([n,info])=>({n,...info}))})};
}

/* A ZIP file, written by hand: everything stored uncompressed, which keeps
   this to a few lines and needs no dependency. JSON zips poorly anyway when
   the archive is only a wrapper for a handful of small files. */
function zipOf(files){
  const crcTable=(()=>{
    const t=new Int32Array(256);
    for(let n=0;n<256;n++){
      let c=n;
      for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;
      t[n]=c;
    }
    return t;
  })();
  const crc32=buf=>{
    let c=-1;
    for(let i=0;i<buf.length;i++)c=crcTable[(c^buf[i])&0xFF]^(c>>>8);
    return (c^-1)>>>0;
  };
  const parts=[],central=[];
  let offset=0;
  for(const f of files){
    const name=Buffer.from(f.name,"utf8");
    const body=Buffer.from(f.data,"utf8");
    const crc=crc32(body);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4); local.writeUInt16LE(0,6); local.writeUInt16LE(0,8);
    local.writeUInt16LE(0,10); local.writeUInt16LE(0,12);
    local.writeUInt32LE(crc,14);
    local.writeUInt32LE(body.length,18); local.writeUInt32LE(body.length,22);
    local.writeUInt16LE(name.length,26); local.writeUInt16LE(0,28);
    parts.push(local,name,body);

    const cen=Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50,0);
    cen.writeUInt16LE(20,4); cen.writeUInt16LE(20,6);
    cen.writeUInt16LE(0,8); cen.writeUInt16LE(0,10);
    cen.writeUInt16LE(0,12); cen.writeUInt16LE(0,14);
    cen.writeUInt32LE(crc,16);
    cen.writeUInt32LE(body.length,20); cen.writeUInt32LE(body.length,24);
    cen.writeUInt16LE(name.length,28);
    cen.writeUInt32LE(0,42);
    cen.writeUInt32LE(offset,42);
    central.push(cen,name);
    offset+=local.length+name.length+body.length;
  }
  const cenBuf=Buffer.concat(central);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(cenBuf.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...parts,cenBuf,end]);
}

/* One puzzle is one file; several are numbered inside a zip. */
function packFiles(puzzles,seedBase){
  const width=String(puzzles.length).length;
  return puzzles.map((p,i)=>({
    name:`puzzle-${String(i+1).padStart(width,"0")}-${p.R}x${p.C}-${p.diff}.json`,
    data:JSON.stringify(makePack([p],seedBase))
  }));
}

function makePack(puzzles,seedBase){
  return {
    format:"slitherlink-pack", version:1,
    generator:"slink-gen "+VERSION,
    created:new Date().toISOString(),
    seed:seedBase,
    puzzles:puzzles.map(p=>({R:p.R,C:p.C,diff:p.diff,given:p.given,
                             minimal:p.minimal,clues:p.clues}))
  };
}

function validateOpts(o){
  const bad=[];
  if(!(o.rows>=2&&o.cols>=2))bad.push("rows and columns must be 2 or more");
  if(!Number.isFinite(o.count)||o.count<1)bad.push("count must be 1 or more");
  if(!DIFFS[o.difficulty])bad.push("difficulty must be one of: "+Object.keys(DIFFS).join(", "));
  return bad;
}


/* ---------------- browser UI ----------------
   Double-clicking the exe on Windows gives no terminal worth typing into, so
   the program serves a small page on localhost and opens the browser at it.
   No dependencies: node's own http module and a string of HTML. */

const UI_PAGE=`<!doctype html><html><head><meta charset="utf-8">
<title>slink-gen</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--sheet:#F3F4EC;--ink:#20232A;--muted:#6B7060;--rule:#D7D8CC;--accent:#1D4E9C}
*{box-sizing:border-box}
body{margin:0;background:var(--sheet);color:var(--ink);
  font:15px/1.5 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
  display:flex;justify-content:center;padding:32px 18px 60px}
.wrap{width:100%;max-width:560px}
h1{font-size:22px;margin:0 0 4px;letter-spacing:-.01em}
.sub{font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--muted);margin:0 0 26px}
.card{background:#fff;border:1px solid var(--rule);border-radius:4px;padding:22px}
label{display:block;font-family:ui-monospace,Consolas,monospace;font-size:10px;
  letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.row{display:flex;gap:14px;margin-bottom:18px}
.row>div{flex:1}
input,select{width:100%;padding:10px 11px;border:1px solid var(--rule);border-radius:3px;
  background:var(--sheet);font:inherit;color:inherit}
input:focus,select:focus{outline:2px solid var(--accent);outline-offset:-1px}
.hint{font-family:ui-monospace,Consolas,monospace;font-size:10px;color:var(--muted);margin:-10px 0 18px}
button{width:100%;padding:13px;border:1px solid var(--ink);border-radius:3px;background:var(--ink);
  color:var(--sheet);font:inherit;font-weight:600;cursor:pointer}
button:disabled{opacity:.45;cursor:default}
button.ghost{background:none;color:var(--ink);font-weight:500;margin-top:9px}
.bar{height:5px;background:var(--rule);border-radius:3px;overflow:hidden;margin:20px 0 9px}
.fill{height:100%;width:0;background:var(--ink);transition:width .2s}
.stat{display:flex;justify-content:space-between;font-family:ui-monospace,Consolas,monospace;
  font-size:11px;color:var(--muted)}
.log{margin-top:16px;font-family:ui-monospace,Consolas,monospace;font-size:11px;
  max-height:190px;overflow:auto;border-top:1px solid var(--rule);padding-top:12px}
.log div{padding:2px 0}
.err{color:#B3261E;font-size:13px;margin-top:14px}
.done{margin-top:18px;padding:14px;border:1px solid var(--ink);border-radius:3px;background:var(--sheet)}
.done b{display:block;font-size:16px;margin-bottom:4px}
.path{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--muted);
  word-break:break-all;margin-top:6px}
</style></head><body><div class="wrap">
<h1>slink-gen</h1>
<p class="sub">Slitherlink puzzle generator</p>
<div class="card">
  <div class="row">
    <div><label for="rows">Rows</label><input id="rows" type="number" min="2" max="100" value="10"></div>
    <div><label for="cols">Columns</label><input id="cols" type="number" min="2" max="100" value="10"></div>
    <div><label for="count">How many</label><input id="count" type="number" min="1" max="200" value="4"></div>
  </div>
  <div class="row">
    <div><label for="diff">Difficulty</label><select id="diff">
      <option value="gentle">Gentle</option>
      <option value="standard" selected>Standard</option>
      <option value="tough">Tough</option>
      <option value="maximal">Maximal (slow)</option>
    </select></div>
    <div><label for="seed">Seed (optional)</label><input id="seed" type="number" placeholder="random"></div>
  </div>
  <p class="hint" id="hint"></p>
  <button id="go">Generate</button>
  <button class="ghost" id="stop" hidden>Stop and keep what's done</button>
  <div id="prog" hidden>
    <div class="bar"><div class="fill" id="fill"></div></div>
    <div class="stat"><span id="stage">Working</span><span id="pct"></span></div>
    <div class="log" id="log"></div>
  </div>
  <div id="result"></div>
  <p class="err" id="err"></p>
</div>
</div>
<script>
const $=i=>document.getElementById(i);
const cores=Number(document.body.dataset.cores||1);
function refreshHint(){
  const n=+$('rows').value*+$('cols').value;
  let t=n+' cells each · '+cores+' core'+(cores===1?'':'s');
  const side=Math.max(+$('rows').value,+$('cols').value);
  // that ceiling was real before the SAT solver went in; 30x30 builds now
  if(side>40)t+=' · very large, this will take a while';
  else if($('diff').value==='maximal'&&n>256)t+=' · a maximal sweep this big runs for minutes';
  $('hint').textContent=t;
}
['rows','cols','diff'].forEach(i=>$(i).addEventListener('input',refreshHint));
refreshHint();

let poller=null;
document.getElementById('stop').onclick=async()=>{
  document.getElementById('stop').disabled=true;
  await fetch('/stop',{method:'POST'});
};
$('go').onclick=async()=>{
  $('err').textContent=''; $('result').innerHTML='';
  const body={rows:+$('rows').value,cols:+$('cols').value,count:+$('count').value,
              difficulty:$('diff').value,seed:$('seed').value?+$('seed').value:0};
  $('go').disabled=true; $('stop').hidden=false; $('prog').hidden=false; $('log').innerHTML='';
  $('fill').style.width='0%'; $('pct').textContent='0%'; $('stage').textContent='Starting';
  try{
    const r=await fetch('/start',{method:'POST',headers:{'Content-Type':'application/json'},
                                 body:JSON.stringify(body)});
    const j=await r.json();
    if(!r.ok){throw new Error(j.error||'could not start');}
  }catch(e){ $('err').textContent=e.message; $('go').disabled=false; $('stop').hidden=true; $('prog').hidden=true; return; }
  $('stop').disabled=false;
  let seen=0;
  poller=setInterval(async()=>{
    const s=await (await fetch('/status')).json();
    const frac=s.total?s.finished/s.total:0;
    $('fill').style.width=(frac*100).toFixed(1)+'%';
    $('pct').textContent=Math.round(frac*100)+'%';
    const secs=Math.round((s.elapsed||0)/1000);
    const clock=secs<60?secs+'s':Math.floor(secs/60)+'m '+String(secs%60).padStart(2,'0')+'s';
    $('stage').textContent=s.done?'Finished'
      :(s.finished+' of '+s.total+' \u00b7 '+(s.busy||'working')+' \u00b7 '+clock);
    while(seen<s.lines.length){
      const d=document.createElement('div'); d.textContent=s.lines[seen++]; $('log').appendChild(d);
      $('log').scrollTop=$('log').scrollHeight;
    }
    if(s.done){
      clearInterval(poller); $('go').disabled=false; $('stop').hidden=true;
      if(s.error){ $('err').textContent=s.error; return; }
      $('result').innerHTML='<div class="done"><b>'+s.count+' puzzle'+(s.count===1?'':'s')+' ready</b>'+
        (s.many?'Nothing has been saved. The download is a zip with each puzzle numbered inside.'
               :'Nothing has been saved yet.')+
        '<div class="path">'+s.name+'</div></div>'+
        '<button class="ghost" onclick="location.href=\\'/pack\\'">Save '+(s.many?'the zip':'the puzzle')+'</button>';
    }
  },350);
};
</script></body></html>`;

function openBrowser(url){
  const {spawn}=require("node:child_process");
  try{
    if(process.platform==="win32")spawn("cmd",["/c","start","",url],{detached:true,stdio:"ignore"}).unref();
    else if(process.platform==="darwin")spawn("open",[url],{detached:true,stdio:"ignore"}).unref();
    else spawn("xdg-open",[url],{detached:true,stdio:"ignore"}).unref();
  }catch(e){ /* the address is printed anyway */ }
}

function serveUI(opt){
  const http=require("node:http");
  let job=null,state=null;

  const send=(res,code,type,body)=>{
    res.writeHead(code,{"Content-Type":type,"Cache-Control":"no-store"});
    res.end(body);
  };

  const server=http.createServer((req,res)=>{
    const url=(req.url||"/").split("?")[0];
    if(url==="/"){
      return send(res,200,"text/html; charset=utf-8",
        UI_PAGE.replace("<body>",`<body data-cores="${os.cpus().length||1}">`));
    }
    if(url==="/status"){
      if(!state)return send(res,200,"application/json",JSON.stringify({finished:0,total:0,lines:[],done:false}));
      const pr=job?job.progress():{finished:0,total:0};
      const ws=pr.workers||[];
      const laying=ws.filter(w=>w.stage==="loop").length;
      const trimming=ws.filter(w=>w.stage==="trim");
      let busy;
      if(state.done)busy="";
      else if(!ws.length)busy="starting";
      else if(ws.length===1&&trimming.length===1)
        busy=`trimming \u00b7 ${trimming[0].checked} checks \u00b7 ${trimming[0].left} clues left`;
      else if(ws.length===1&&laying===1)
        busy=`laying out a loop \u00b7 attempt ${ws[0].attempt}`;
      else{
        // several puzzles at once: a single clue count would be a different
        // puzzle's each time it refreshed
        const parts=[];
        if(laying)parts.push(`${laying} laying out a loop`);
        if(trimming.length)parts.push(`${trimming.length} trimming`);
        busy=parts.join(" \u00b7 ")||"working";
      }
      return send(res,200,"application/json",JSON.stringify({
        finished:state.done?state.count:pr.finished,total:pr.total||state.total,
        lines:state.lines,done:state.done,error:state.error,busy,
        elapsed:pr.ms,count:state.count,name:state.name||"",many:!!state.many}));
    }
    if(url==="/pack"){
      if(!state||!state.body)return send(res,404,"text/plain","nothing generated yet");
      res.writeHead(200,{
        "Content-Type":state.many?"application/zip":"application/json",
        "Content-Disposition":`attachment; filename="${state.name}"`});
      return res.end(state.body);
    }
    if(url==="/stop"&&req.method==="POST"){
      if(job)job.stop();
      return send(res,200,"application/json",'{"ok":true}');
    }
    if(url==="/start"&&req.method==="POST"){
      let raw="";
      req.on("data",d=>{raw+=d; if(raw.length>4096)req.destroy();});
      req.on("end",()=>{
        let body;
        try{ body=JSON.parse(raw); }catch(e){ return send(res,400,"application/json",'{"error":"bad request"}'); }
        if(state&&!state.done)return send(res,409,"application/json",'{"error":"already running"}');
        const o={...DEFAULTS,...opt,
          rows:Math.trunc(body.rows),cols:Math.trunc(body.cols),
          count:Math.trunc(body.count),difficulty:String(body.difficulty||"standard"),
          seed:Number(body.seed)||0};
        const bad=validateOpts(o);
        if(bad.length)return send(res,400,"application/json",JSON.stringify({error:bad.join("; ")}));
        state={lines:[],done:false,error:null,count:0,total:o.count,body:null,name:"",many:false};
        job=runPool(o,{
          onPuzzle:(p,n)=>state.lines.push(
            `${n}/${o.count}  ${p.R}×${p.C}  ${p.given} clues  ${p.passes} pass${p.passes===1?"":"es"}`
            +(p.inconclusive?`  (${p.inconclusive} unproven)`:"")+`  ${fmt(p.ms)}`)
        });
        job.done.then(out=>{
          if(!out.puzzles.length){
            state.error="Nothing was generated. "+(out.failures[0]||"");
            state.done=true; return;
          }
          /* Held in memory. Nothing lands on disk unless the save button is
             pressed — generating should not litter the folder. */
          const many=out.puzzles.length>1;
          state.many=many;
          state.count=out.puzzles.length;
          state.body=many?zipOf(packFiles(out.puzzles,out.seedBase))
                         :Buffer.from(JSON.stringify(makePack(out.puzzles,out.seedBase)));
          state.name=many?`slitherlink-${out.puzzles.length}-puzzles.zip`
                         :`slitherlink-${out.puzzles[0].R}x${out.puzzles[0].C}-${out.puzzles[0].diff}.json`;
          state.lines.push(`done in ${fmt(out.ms)}`);
          state.done=true;
        }).catch(e=>{ state.error=String(e&&e.message||e); state.done=true; });
        send(res,200,"application/json",'{"ok":true}');
      });
      return;
    }
    send(res,404,"text/plain","not found");
  });

  server.listen(0,"127.0.0.1",()=>{
    const url="http://127.0.0.1:"+server.address().port+"/";
    console.log("slink-gen "+VERSION);
    console.log("  UI running at "+url);
    console.log("  Leave this window open while you use it. Ctrl+C to stop.");
    openBrowser(url);
  });
}


/* ---------------- room server ----------------
   window.storage only exists inside the Claude artifact runtime. Opened as a
   local file, or shared between two machines, the page has nowhere to put a
   room. This serves the page and a tiny key/value store so the plot room can
   be shared over a network. */
function lanAddresses(port){
  const out=[];
  const ifaces=os.networkInterfaces();
  for(const name in ifaces)
    for(const ni of ifaces[name]||[])
      if(ni.family==="IPv4"&&!ni.internal)out.push(`http://${ni.address}:${port}/`);
  return out;
}

function serveRoom(opt){
  const http=require("node:http");
  const PAGE_NAMES=["slitherlink-plotroom.html","plotroom.html","index.html"];
  const here=path.dirname(process.execPath.includes("slink-gen")?process.execPath:__filename);
  const findPage=()=>{
    if(opt.page)return path.resolve(opt.page);
    for(const dir of [process.cwd(),here])
      for(const n of PAGE_NAMES){
        const f=path.join(dir,n);
        if(fs.existsSync(f))return f;
      }
    return null;
  };

  const store=new Map();
  const file=path.resolve(opt.data||"slink-rooms.json");
  try{
    if(fs.existsSync(file))
      for(const [k,v] of Object.entries(JSON.parse(fs.readFileSync(file,"utf8"))))store.set(k,v);
  }catch(e){ /* start empty rather than refuse to run */ }
  let saveTimer=null;
  const saveSoon=()=>{
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{
      try{ fs.writeFileSync(file,JSON.stringify(Object.fromEntries(store))); }catch(e){}
    },800);
  };

  const server=http.createServer((req,res)=>{
    const u=(req.url||"/").split("?")[0];
    const cors={"Access-Control-Allow-Origin":"*",
                "Access-Control-Allow-Methods":"GET,PUT,POST,OPTIONS",
                "Access-Control-Allow-Headers":"Content-Type"};
    if(req.method==="OPTIONS"){ res.writeHead(204,cors); return res.end(); }

    if(u==="/kv/__health"){
      res.writeHead(200,{...cors,"Content-Type":"text/plain"});
      return res.end("ok");
    }
    if(u.startsWith("/kv/")){
      const key=decodeURIComponent(u.slice(4));
      if(req.method==="GET"){
        if(!store.has(key)){ res.writeHead(404,cors); return res.end(); }
        res.writeHead(200,{...cors,"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"});
        return res.end(store.get(key));
      }
      if(req.method==="PUT"||req.method==="POST"){
        let raw="";
        req.on("data",d=>{ raw+=d; if(raw.length>8e6)req.destroy(); });
        req.on("end",()=>{
          store.set(key,raw); saveSoon();
          res.writeHead(200,{...cors,"Content-Type":"text/plain"});
          res.end("ok");
        });
        return;
      }
      res.writeHead(405,cors); return res.end();
    }
    if(u==="/"||u==="/index.html"){
      const f=findPage();
      if(!f){
        res.writeHead(500,{"Content-Type":"text/plain; charset=utf-8"});
        return res.end("Put slitherlink-plotroom.html next to this program (or pass --page path\\to\\file.html) and reload.");
      }
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
      return res.end(fs.readFileSync(f));
    }
    res.writeHead(404,{"Content-Type":"text/plain"}); res.end("not found");
  });

  const port=opt.port||8080;
  server.on("error",e=>{
    console.error("slink-gen: could not start the server on port "+port+" ("+e.code+").");
    if(e.code==="EADDRINUSE")console.error("  Something else is using it. Try --port 8081.");
    process.exit(1);
  });
  server.listen(port,"0.0.0.0",()=>{
    const page=findPage();
    console.log("slink-gen "+VERSION+" — room server");
    console.log("  NOTE: this built-in server has no room key, so treat it as");
    console.log("  private-network only. For anything reachable from outside,");
    console.log("  use slink-server, which requires a key by default.");
    console.log("  On this computer:  http://localhost:"+port+"/");
    const lan=lanAddresses(port);
    if(lan.length){
      console.log("  For other people on your network:");
      for(const a of lan)console.log("    "+a);
    }
    console.log(page?"  Serving page: "+page
                    :"  NOTE: no plotroom html found next to this program yet.");
    console.log("  Rooms are saved in "+file);
    console.log("  Windows may ask to allow this through the firewall — say yes for private networks.");
    console.log("  Leave this window open. Ctrl+C to stop.");
    if(!opt.noopen)openBrowser("http://localhost:"+port+"/");
  });
}

async function main(){
  let opt;
  try{ opt=parseArgs(process.argv.slice(2)); }
  catch(e){ console.error("slink-gen: "+e.message+"\nTry --help."); process.exit(2); }
  if(opt.help){ process.stdout.write(HELP); return; }
  if(opt.version){ console.log(VERSION); return; }
  // Nothing on the command line means it was probably double-clicked, so open
  // the browser UI rather than assuming a terminal is there to type into.
  if(opt.serve){ serveRoom(opt); return; }
  if(opt.ui||process.argv.length<=2){ serveUI(opt); return; }
  if(opt.ask)await askSettings(opt);

  const bad0=validateOpts(opt);
  if(bad0.length){ console.error("slink-gen: "+bad0.join("; ")+"\nTry --help."); process.exit(2); }

  const job=runPool(opt,{
    onPuzzle:(p,n)=>{
      if(opt.quiet)return;
      if(tty)process.stderr.write("\r"+" ".repeat(78)+"\r");
      process.stderr.write(`  ${String(n).padStart(String(opt.count).length)}/${opt.count}`
        +`  ${p.R}×${p.C}  ${String(p.given).padStart(3)} clues`
        +`  ${p.passes} pass${p.passes===1?"":"es"}`
        +(p.inconclusive?`  (${p.inconclusive} unproven)`:"")
        +`  ${fmt(p.ms)}\n`);
    }
  });

  const log=s=>{ if(!opt.quiet)process.stderr.write(s); };
  log(`slink-gen ${VERSION}\n`);
  log(`  ${opt.count} × ${opt.rows}×${opt.cols} ${opt.difficulty}`
     +`  ·  ${job.nWorkers} of ${job.cores} core${job.cores===1?"":"s"}`
     +`  ·  seed ${job.seedBase}\n\n`);

  const draw=()=>{
    if(!tty||opt.quiet)return;
    const pr=job.progress();
    const per=pr.finished?pr.ms/pr.finished:0;
    const left=per?fmt(per*(pr.total-pr.finished)):"—";
    const busy=pr.workers.filter(w=>w.stage==="trim").length;
    const laying=pr.workers.filter(w=>w.stage==="loop").length;
    process.stderr.write("\r  ["+bar(pr.finished/pr.total,22)+"] "+pr.finished+"/"+pr.total
      +"  "+fmt(pr.ms)+" elapsed"
      +(pr.finished<pr.total?"  ~"+left+" left":"")
      +(laying?"  "+laying+" laying out":"")
      +(busy?"  "+busy+" trimming":"")
      +"  "+pr.ticks+" checks   ");
  };
  const timer=tty&&!opt.quiet?setInterval(draw,120):null;
  let interrupted=false;
  const onSig=()=>{
    if(interrupted){ process.exit(130); }      // a second Ctrl+C really quits
    interrupted=true;
    if(timer)clearInterval(timer);
    if(tty&&!opt.quiet)process.stderr.write("\r"+" ".repeat(78)+"\r");
    log("\n  Stopping — keeping the clues found so far. Ctrl+C again to abandon.\n");
    job.stop();
  };
  process.on("SIGINT",onSig);
  const out0=await job.done;
  process.removeListener("SIGINT",onSig);
  const {puzzles,failures,seedBase}=out0;
  if(timer)clearInterval(timer);
  if(tty&&!opt.quiet)process.stderr.write("\r"+" ".repeat(78)+"\r");

  if(!puzzles.length){
    console.error("slink-gen: nothing was generated. "+(failures[0]||""));
    process.exit(1);
  }

  const many=puzzles.length>1;
  let outName=opt.out;
  if(many&&/\.json$/i.test(outName))outName=outName.replace(/\.json$/i,".zip");
  const payload=many?zipOf(packFiles(puzzles,seedBase))
                    :JSON.stringify(makePack(puzzles,seedBase));
  const out=path.resolve(outName);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,payload);

  if(interrupted)log("  Stopped early.\n");
  const secs=out0.ms/1000;
  const avg=puzzles.reduce((a,p)=>a+p.ms,0)/puzzles.length;
  log("\n");
  console.log(`${puzzles.length} puzzle${puzzles.length===1?"":"s"} → ${out}`);
  log(`  ${secs.toFixed(1)}s wall · ${fmt(avg)} average each`
     +(failures.length?` · ${failures.length} failed`:"")+"\n");
  log(`  Import it from the "New sheet" card in the plot room.\n`);
}

main().catch(e=>{ console.error("slink-gen: "+(e&&e.message||e)); process.exit(1); });
