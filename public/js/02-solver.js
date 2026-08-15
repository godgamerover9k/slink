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
