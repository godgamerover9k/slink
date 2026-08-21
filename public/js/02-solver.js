import { OFF, ON, UNK } from "./01-engine.js";

/* ============================================================
   2. Solver — used for generation, hints and error checks
   ============================================================ */
function Solver(engine) {
  const EDGE_COUNT = engine.E,
    DOT_COUNT = engine.VC,
    CELL_COUNT = engine.NC;
  const edgeState = new Uint8Array(EDGE_COUNT),
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
  const pushV = dot => {
    if (!inQ[dot]) {
      inQ[dot] = 1;
      queue[qt++] = dot;
    }
  };
  const pushC = cell => {
    const id = DOT_COUNT + cell;
    if (!inQ[id]) {
      inQ[id] = 1;
      queue[qt++] = id;
    }
  };
  function clearQueue() {
    while (qh < qt) inQ[queue[qh++]] = 0;
    qh = qt = 0;
  }

  function setEdge(edge, val) {
    if (edgeState[edge] !== UNK) return edgeState[edge] === val;
    edgeState[edge] = val;
    trail[trailTop++] = edge;
    pushV(engine.ea[edge]);
    pushV(engine.eb[edge]);
    const n = engine.affN[edge];
    for (let j = 0; j < n; j++) pushC(engine.aff[edge * 6 + j]);
    if (val === ON) {
      const ra = find(engine.ea[edge]),
        rb = find(engine.eb[edge]);
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
        const dot = id,
          base = dot * 4,
          n = engine.vDeg[dot];
        let on = 0,
          unk = 0,
          lastUnk = -1;
        for (let j = 0; j < n; j++) {
          const edge = engine.vEdge[base + j],
            s = edgeState[edge];
          if (s === ON) on++;
          else if (s === UNK) {
            unk++;
            lastUnk = edge;
          }
        }
        if (on > 2) {
          clearQueue();
          return false;
        }
        if (on === 2) {
          if (unk)
            for (let j = 0; j < n; j++) {
              const edge = engine.vEdge[base + j];
              if (edgeState[edge] === UNK) setEdge(edge, OFF);
            }
        } else if (on === 1) {
          if (unk === 0) {
            clearQueue();
            return false;
          }
          if (unk === 1) setEdge(lastUnk, ON);
        } else if (on === 0 && unk === 1) setEdge(lastUnk, OFF);
      } else {
        const cell = id - DOT_COUNT,
          want = clues[cell];
        if (want < 0) continue;
        const base = cell * 4;
        let on = 0,
          unk = 0;
        for (let j = 0; j < 4; j++) {
          const s = edgeState[engine.cEdge[base + j]];
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
              const edge = engine.cEdge[base + j];
              if (edgeState[edge] === UNK) setEdge(edge, OFF);
            }
          } else if (on + unk === want) {
            for (let j = 0; j < 4; j++) {
              const edge = engine.cEdge[base + j];
              if (edgeState[edge] === UNK) setEdge(edge, ON);
            }
          }
        }
        // corner rule: with no line able to arrive from outside the cell, the cell's
        // two segments at that corner are both drawn or both blank.
        if (want >= 1 && want <= 3) {
          const cornerBase = cell * 16;
          for (let cornerIx = 0; cornerIx < 4; cornerIx++) {
            const outA = engine.corner[cornerBase + cornerIx * 4 + 2],
              outB = engine.corner[cornerBase + cornerIx * 4 + 3];
            if ((outA < 0 ? OFF : edgeState[outA]) !== OFF) continue;
            if ((outB < 0 ? OFF : edgeState[outB]) !== OFF) continue;
            const inA = engine.corner[cornerBase + cornerIx * 4],
              inB = engine.corner[cornerBase + cornerIx * 4 + 1],
              stateA = edgeState[inA],
              stateB = edgeState[inB];
            if (want === 1) {
              if (stateA === UNK) setEdge(inA, OFF);
              if (stateB === UNK) setEdge(inB, OFF);
            } else if (want === 3) {
              if (stateA === UNK) setEdge(inA, ON);
              if (stateB === UNK) setEdge(inB, ON);
            } else {
              if (stateA === ON && stateB === UNK) setEdge(inB, ON);
              else if (stateA === OFF && stateB === UNK) setEdge(inB, OFF);
              else if (stateB === ON && stateA === UNK) setEdge(inA, ON);
              else if (stateB === OFF && stateA === UNK) setEdge(inA, OFF);
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
      if (edgeState[i] === ON) {
        deg[engine.ea[i]]++;
        deg[engine.eb[i]]++;
        onCount++;
        anyV = engine.ea[i];
      }
    if (!onCount) return false;
    let vertsWithDeg = 0;
    for (let dot = 0; dot < DOT_COUNT; dot++) {
      if (deg[dot] !== 0 && deg[dot] !== 2) return false;
      if (deg[dot]) vertsWithDeg++;
    }
    seenMark++;
    let sp = 0;
    stack[sp++] = anyV;
    seen[anyV] = seenMark;
    let reached = 1;
    while (sp) {
      const dot = stack[--sp],
        base = dot * 4,
        n = engine.vDeg[dot];
      for (let j = 0; j < n; j++) {
        const edge = engine.vEdge[base + j];
        if (edgeState[edge] !== ON) continue;
        const w = engine.ea[edge] === dot ? engine.eb[edge] : engine.ea[edge];
        if (seen[w] !== seenMark) {
          seen[w] = seenMark;
          reached++;
          stack[sp++] = w;
        }
      }
    }
    if (reached !== vertsWithDeg) return false;
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const want = clues[cell];
      if (want < 0) continue;
      const base = cell * 4;
      let on = 0;
      for (let j = 0; j < 4; j++) if (edgeState[engine.cEdge[base + j]] === ON) on++;
      if (on !== want) return false;
    }
    return true;
  }

  function pick() {
    for (let dot = 0; dot < DOT_COUNT; dot++) {
      const base = dot * 4,
        n = engine.vDeg[dot];
      let on = 0,
        unkE = -1;
      for (let j = 0; j < n; j++) {
        const edge = engine.vEdge[base + j];
        if (edgeState[edge] === ON) on++;
        else if (edgeState[edge] === UNK && unkE < 0) unkE = edge;
      }
      if (on === 1 && unkE >= 0) return unkE;
    }
    let best = -1,
      bestScore = 9;
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (clues[cell] < 0) continue;
      const base = cell * 4;
      let unk = 0,
        p = -1;
      for (let j = 0; j < 4; j++) {
        const edge = engine.cEdge[base + j];
        if (edgeState[edge] === UNK) {
          unk++;
          p = edge;
        }
      }
      if (unk > 0 && unk < bestScore) {
        bestScore = unk;
        best = p;
      }
    }
    if (best >= 0) return best;
    for (let i = 0; i < EDGE_COUNT; i++) if (edgeState[i] === UNK) return i;
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
      solution = edgeState.slice();
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
    const edge = pick();
    if (edge < 0) {
      // every edge decided: judge the board as it stands
      if (verify()) found();
      return;
    }
    for (let dot = 0; dot < 2; dot++) {
      const tm = trailTop,
        um = utop,
        cf = cycleFlag;
      setEdge(edge, dot === 0 ? ON : OFF);
      rec(cf);
      clearQueue();
      while (utop > um) {
        const big = utrail[--utop],
          small = utrail[--utop];
        usize[big] -= usize[small];
        parent[small] = small;
      }
      while (trailTop > tm) edgeState[trail[--trailTop]] = UNK;
      cycleFlag = cf;
      if (count >= limit || aborted) return;
    }
  }

  function snap() {
    const s = edgeState.slice();
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
    edgeState.fill(UNK);
    trailTop = 0;
    utop = 0;
    cycleFlag = 0;
    for (let dot = 0; dot < DOT_COUNT; dot++) {
      parent[dot] = dot;
      usize[dot] = 1;
    }
    qh = qt = 0;
    inQ.fill(0);
    limit = lim || 2;
    budget = bud || 200000;
    nodes = 0;
    aborted = false;
    count = 0;
    solution = null;
    for (let dot = 0; dot < DOT_COUNT; dot++) pushV(dot);
    for (let cell = 0; cell < CELL_COUNT; cell++) pushC(cell);
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

/* what other parts of the program use from here */
export {
  Solver,
};
