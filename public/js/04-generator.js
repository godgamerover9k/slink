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
