/* ============================================================
   5. Board rendering
   ============================================================ */
const CELL = 34,
  PAD = 22;
const board = document.getElementById("board");
let segEls = [],
  xEls = [],
  clueEls = [],
  dotEls = [],
  badEls = [],
  fillEls = [];
let traceEl = null,
  premGroup = null,
  gDiag = null,
  gBoard = null,
  gRel = null,
  gSegGhost = null,   // undecided segments, kept beneath the drawn ones
  gSegDrawn = null;   // the drawn ones, above them

function edgeGeom(i) {
  const { R, C, HN: H_EDGE_COUNT } = engine;
  if (i < H_EDGE_COUNT) {
    const r = (i / C) | 0,
      c = i % C;
    return {
      x1: PAD + c * CELL,
      y1: PAD + r * CELL,
      x2: PAD + (c + 1) * CELL,
      y2: PAD + r * CELL,
    };
  }
  const j = i - H_EDGE_COUNT,
    r = (j / (C + 1)) | 0,
    c = j % (C + 1);
  return {
    x1: PAD + c * CELL,
    y1: PAD + r * CELL,
    x2: PAD + c * CELL,
    y2: PAD + (r + 1) * CELL,
  };
}

/* A pen used to be recorded as a position in the players list. Two clients
   can build that list in different orders, so the same number meant different
   people and lines took on someone else's colour. It is now derived from the
   player's id, which every client agrees on and which never shifts when
   somebody joins or leaves. */
function penSlot(id) {
  if (!id) return -1;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000000; // an identity, not a colour slot
}

/* Two people can hash to the same pen. Walking to the next free one, over the
   player list sorted by id, gives everybody a different colour and gives every
   client the same answer without depending on the order people arrived. */
let penMap = null;
function buildPenMap() {
  penMap = new Map();
  const ids = [...((room && room.players) || [])]
    .map(p => p.id)
    .filter(Boolean)
    .sort();
  const used = new Set();
  for (const id of ids) {
    const h = penSlot(id);
    let s = h % PENS.length;
    for (let i = 0; i < PENS.length && used.has(s); i++) s = (s + 1) % PENS.length;
    used.add(s);
    penMap.set(h, s);
  }
}
function penVar(idx) {
  if (idx < 0) return "var(--graphite)";
  const s = penMap && penMap.has(idx) ? penMap.get(idx) : idx % PENS.length;
  return `var(${PENS[s]})`;
}

function buildBoard() {
  const { R, C, E: EDGE_COUNT, VC: DOT_COUNT, NC: CELL_COUNT } = engine;
  const W = C * CELL + PAD * 2,
    Hh = R * CELL + PAD * 2;
  board.setAttribute("viewBox", `0 0 ${W} ${Hh}`);
  viewFull = { w: W, h: Hh };
  resetView();
  board.setAttribute("tabindex", "0");
  board.innerHTML = "";
  const NS = "http://www.w3.org/2000/svg";
  const mk = (n, a) => {
    const el = document.createElementNS(NS, n);
    for (const k in a) el.setAttribute(k, a[k]);
    return el;
  };

  gBoard = mk("g");
  gBoard.appendChild(mk("rect", { x: 0, y: 0, width: W, height: Hh, class: "outside" }));
  gBoard.appendChild(
    mk("rect", { x: PAD, y: PAD, width: C * CELL, height: R * CELL, class: "inside" }),
  );
  gDiag = mk("g");
  const gFill = mk("g"),
    gBad = mk("g"),
    gSeg = mk("g"),
    gX = mk("g"),
    gDot = mk("g"),
    gClue = mk("g");
  badEls = [];
  clueEls = [];
  segEls = [];
  xEls = [];
  dotEls = [];
  fillEls = [];

  for (let k = 0; k < CELL_COUNT; k++) {
    const r = (k / C) | 0,
      c = k % C;
    // full-bleed, with a hair of overlap so touching squares leave no seam
    const fill = mk("rect", {
      x: PAD + c * CELL - 0.25,
      y: PAD + r * CELL - 0.25,
      width: CELL + 0.5,
      height: CELL + 0.5,
      class: "fillsq",
    });
    gFill.appendChild(fill);
    fillEls.push(fill);
    const rect = mk("rect", {
      x: PAD + c * CELL + 3,
      y: PAD + r * CELL + 3,
      width: CELL - 6,
      height: CELL - 6,
      rx: 2,
      class: "badv",
    });
    rect.style.opacity = 0;
    gBad.appendChild(rect);
    badEls.push(rect);
    const t = mk("text", {
      x: PAD + c * CELL + CELL / 2,
      y: PAD + r * CELL + CELL / 2 + CELL * 0.185,
      class: "clue",
      "font-size": CELL * 0.5,
    });
    gClue.appendChild(t);
    clueEls.push(t);
  }
  for (let i = 0; i < EDGE_COUNT; i++) {
    const q = edgeGeom(i);
    const ln = mk("line", { x1: q.x1, y1: q.y1, x2: q.x2, y2: q.y2, class: "seg" });
    gSeg.appendChild(ln);
    segEls.push(ln);
    const mx = (q.x1 + q.x2) / 2,
      my = (q.y1 + q.y2) / 2,
      d = CELL * 0.105;
    const x = mk("g", { class: "xm" });
    x.appendChild(mk("line", { x1: mx - d, y1: my - d, x2: mx + d, y2: my + d }));
    x.appendChild(mk("line", { x1: mx - d, y1: my + d, x2: mx + d, y2: my - d }));
    gX.appendChild(x);
    xEls.push(x);
  }
  for (let v = 0; v < DOT_COUNT; v++) {
    const r = (v / (C + 1)) | 0,
      c = v % (C + 1);
    const d = mk("circle", { cx: PAD + c * CELL, cy: PAD + r * CELL, r: 1.9, class: "dot" });
    gDot.appendChild(d);
    dotEls.push(d);
  }
  traceEl = mk("path", { class: "trace", d: "" });
  premGroup = mk("g");
  gRel = mk("g");
  /* Bottom to top: paper, colour fills, diagonal scribbles, the error wash,
     then x marks and lines, then premise rings (which must stay visible even
     when they circle a drawn line), and finally the dots and clue numbers so
     nothing an annotation draws can bury the puzzle's own information. */
  gSegGhost = mk("g");
  gSegDrawn = gSeg;
  board.append(
    gBoard, gFill, gDiag, gBad, gX, gSegGhost, gSeg, gRel, premGroup, gDot, gClue, traceEl,
  );
}

/* nearest segment to a point, or -1 */
function edgeAt(x, y) {
  const { R, C } = engine;
  const col = (x - PAD) / CELL,
    row = (y - PAD) / CELL;
  let best = -1,
    bestD = Infinity;
  const consider = i => {
    if (i < 0) return;
    const q = edgeGeom(i);
    // distance from point to the segment
    const dx = q.x2 - q.x1,
      dy = q.y2 - q.y1;
    const t = Math.max(
      0,
      Math.min(1, ((x - q.x1) * dx + (y - q.y1) * dy) / (dx * dx + dy * dy)),
    );
    const px = q.x1 + t * dx,
      py = q.y1 + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  };
  const hr = Math.round(row),
    hc = Math.floor(col);
  if (hr >= 0 && hr <= R && hc >= 0 && hc < C) consider(engine.H(hr, hc));
  const vc = Math.round(col),
    vr = Math.floor(row);
  if (vc >= 0 && vc <= C && vr >= 0 && vr < R) consider(engine.V(vr, vc));
  return bestD < CELL * 0.42 ? best : -1;
}

function cellSatisfied(k) {
  const want = room.clues[k];
  if (want < 0) return 0;
  let on = 0;
  for (let j = 0; j < 4; j++) if (room.edges[engine.cEdge[k * 4 + j]] === "1") on++;
  return on > want ? 2 : on === want ? 1 : 0;
}

function loopStatus(edges) {
  edges = edges || room.edges;
  const { E: EDGE_COUNT, VC: DOT_COUNT, NC: CELL_COUNT } = engine,
    deg = new Int8Array(DOT_COUNT);
  let on = 0,
    anyV = -1;
  for (let i = 0; i < EDGE_COUNT; i++)
    if (edges[i] === "1") {
      deg[engine.ea[i]]++;
      deg[engine.eb[i]]++;
      on++;
      anyV = engine.ea[i];
    }
  if (!on) return { on: 0, solved: false };
  let withDeg = 0;
  for (let v = 0; v < DOT_COUNT; v++) {
    if (deg[v] !== 0 && deg[v] !== 2) return { on, solved: false };
    if (deg[v]) withDeg++;
  }
  const seen = new Uint8Array(DOT_COUNT);
  const st = [anyV];
  seen[anyV] = 1;
  let reached = 1;
  while (st.length) {
    const v = st.pop();
    for (let j = 0; j < engine.vDeg[v]; j++) {
      const e = engine.vEdge[v * 4 + j];
      if (edges[e] !== "1") continue;
      const w = engine.ea[e] === v ? engine.eb[e] : engine.ea[e];
      if (!seen[w]) {
        seen[w] = 1;
        reached++;
        st.push(w);
      }
    }
  }
  if (reached !== withDeg) return { on, solved: false };
  for (let k = 0; k < CELL_COUNT; k++) {
    const want = room.clues[k];
    if (want < 0) continue;
    let c = 0;
    for (let j = 0; j < 4; j++) if (edges[engine.cEdge[k * 4 + j]] === "1") c++;
    if (c !== want) return { on, solved: false };
  }
  return { on, solved: true };
}

let dimClues = true,
  weighted = false;

function render() {
  if (!room || !engine) return;
  const { E: EDGE_COUNT, NC: CELL_COUNT } = engine;
  /* Pen colours exist to tell people apart. On your own there is nobody to
     tell apart, so the sheet reads better in plain graphite. */
  const soloPen = (room.players || []).filter(p => now() - p.seen < IDLE_MS).length < 2;
  buildPenMap();

  for (let i = 0; i < EDGE_COUNT; i++) {
    const s = room.edges[i];
    const seg = segEls[i];
    if (s === "1") {
      seg.classList.add("on");
      seg.setAttribute("stroke", soloPen ? "var(--graphite)" : penVar(room.eo[i]));
      // drawn lines belong on top of the undecided grid, so lift them into the
      // upper group rather than relying on edge order
      if (gSegDrawn && seg.parentNode !== gSegDrawn) gSegDrawn.appendChild(seg);
    } else {
      seg.classList.remove("on");
      if (gSegGhost && seg.parentNode !== gSegGhost) gSegGhost.appendChild(seg);
    }
    xEls[i].classList.toggle("on", s === "2");
    if (s === "2") {
      const col = soloPen ? "var(--x-mark)" : penVar(room.eo[i]);
      for (const ln of xEls[i].children) ln.setAttribute("stroke", col);
    }
    seg.classList.toggle("off", s === "2"); // "ruled out" in the weighted view
  }
  ensureCells(room);
  for (let k = 0; k < CELL_COUNT; k++) {
    const m = room.cells[k],
      f = fillEls[k];
    if (!f) continue;
    if (m === "1" || m === "2") {
      f.setAttribute("fill", MARK_FILL[m]);
      f.classList.add("on");
    } else f.classList.remove("on");
  }
  for (let k = 0; k < CELL_COUNT; k++) {
    const want = room.clues[k],
      el = clueEls[k];
    if (want < 0) {
      el.textContent = "";
      continue;
    }
    el.textContent = want;
    const s = cellSatisfied(k);
    el.classList.toggle("done", dimClues && s === 1);
    el.classList.toggle("over", s === 2);
  }
  const info = loopStatus();
  // only worth saying when it is worth saying; the counts live in Progress
  document.getElementById("statline").textContent = room.solvedAt
    ? "Loop closed — puzzle complete"
    : "";
  document.getElementById("sizeline").textContent =
    `${room.R}×${room.C} · ${(DIFFS[room.diff] || {}).label || room.diff}${room.minimal ? " · minimal" : ""}`;

  if (info.solved && !room.solvedAt && !trial) {
    room.solvedAt = now();
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 60);
  }
  if (room.solvedAt && !solvedShown && !trial) {
    solvedShown = true;
    celebrate();
    showDone(false);
  }
  // a branch that closes the loop has solved the puzzle just as much
  if (trial && info.solved && !trial.doneShown) {
    trial.doneShown = true;
    celebrate();
    showDone(true);
  }

  paintDiagonals();
  paintRels();
  renderRack();
  renderReadout(info);
  renderTrial();
  applyOwnerRules();
}

const MARK_FILL = { 1: "var(--mark-blue)", 2: "var(--mark-yellow)" };

/* A claim is drawn as a tie between the two squares: a plain line for "same
   side", one with a break through it for "opposite sides". */
function paintRels() {
  if (!gRel) return;
  while (gRel.firstChild) gRel.removeChild(gRel.firstChild);
  ensureCells(room);
  const NS = "http://www.w3.org/2000/svg";
  const mid = k => ({
    x: PAD + (k % engine.C) * CELL + CELL / 2,
    y: PAD + ((k / engine.C) | 0) * CELL + CELL / 2,
  });
  for (const key in room.rels) {
    const [a, b] = key.split(":").map(Number);
    if (!(a >= 0 && b >= 0 && a < engine.NC && b < engine.NC)) continue;
    const p = mid(a),
      q = mid(b);
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", p.x);
    l.setAttribute("y1", p.y);
    l.setAttribute("x2", q.x);
    l.setAttribute("y2", q.y);
    l.setAttribute("class", "rel rel--" + room.rels[key]);
    gRel.appendChild(l);
    if (room.rels[key] === "d") {
      // a break, meaning "not the same"
      const cx = (p.x + q.x) / 2,
        cy = (p.y + q.y) / 2;
      const dx = q.x - p.x,
        dy = q.y - p.y,
        len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * CELL * 0.16,
        ny = (dx / len) * CELL * 0.16;
      const t = document.createElementNS(NS, "line");
      t.setAttribute("x1", cx - nx);
      t.setAttribute("y1", cy - ny);
      t.setAttribute("x2", cx + nx);
      t.setAttribute("y2", cy + ny);
      t.setAttribute("class", "rel rel--tick");
      gRel.appendChild(t);
    }
  }
}

function paintDiagonals() {
  if (!gDiag) return;
  while (gDiag.firstChild) gDiag.removeChild(gDiag.firstChild);
  ensureCells(room);
  const NS = "http://www.w3.org/2000/svg",
    pad = 0; // corner to corner
  for (let k = 0; k < engine.NC; k++) {
    const m = room.diag[k];
    if (m === "0") continue;
    const r = (k / engine.C) | 0,
      c = k % engine.C,
      x = PAD + c * CELL,
      y = PAD + r * CELL;
    const l = document.createElementNS(NS, "line");
    if (m === "1") {
      l.setAttribute("x1", x + pad);
      l.setAttribute("y1", y + pad);
      l.setAttribute("x2", x + CELL - pad);
      l.setAttribute("y2", y + CELL - pad);
    } else {
      l.setAttribute("x1", x + CELL - pad);
      l.setAttribute("y1", y + pad);
      l.setAttribute("x2", x + pad);
      l.setAttribute("y2", y + CELL - pad);
    }
    l.setAttribute("class", "dg");
    gDiag.appendChild(l);
  }
}

function renderRack() {
  const rack = document.getElementById("rack");
  const live = [...room.players].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  rack.innerHTML = "";
  live.forEach(p => {
    const idx = penSlot(p.id); // same rule the board uses
    void idx;
    const idle = now() - p.seen > IDLE_MS;
    const el = document.createElement("div");
    el.className = "pen" + (p.id === me.id ? " pen--you" : "") + (idle ? " pen--idle" : "");
    el.style.setProperty("--pen", penVar(penSlot(p.id)));
    el.innerHTML = `<div class="pen__barrel"></div><div class="pen__meta">
      <span class="pen__name"></span></div>`;
    el.querySelector(".pen__name").textContent = p.name + (p.id === me.id ? " (you)" : "");
    rack.appendChild(el);
  });
  const online = room.players.filter(p => now() - p.seen < IDLE_MS).length;
  document.getElementById("onlinecount").textContent = online + " here";
}

function renderReadout(info) {
  const total = room.clues.filter(v => v >= 0).length;
  let done = 0;
  for (let k = 0; k < engine.NC; k++) if (room.clues[k] >= 0 && cellSatisfied(k) === 1) done++;
  const el = document.getElementById("readout");
  el.innerHTML =
    `Clues met <b>${done}</b> of <b>${total}</b><br>` +
    `Segments <b>${info.on}</b> · X marks <b>${[...room.edges].filter(c => c === "2").length}</b>`;
  document.getElementById("progbar").style.width = (total ? (done / total) * 100 : 0) + "%";
}

let doneAt = 0;
function fmtClock(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(t / 60);
  return m ? `${m}m ${String(t % 60).padStart(2, "0")}s` : `${t}s`;
}

function showDone(fromBranch) {
  const el = document.getElementById("done");
  const started = room.gen || doneAt || Date.now();
  const stats = [
    ["Grid", `${room.R}×${room.C}`],
    ["Clues", String(room.given != null ? room.given : room.clues.filter(v => v >= 0).length)],
    ["Segments", String([...room.edges].filter(c => c === "1").length)],
    ["Time", fmtClock(Date.now() - started)],
  ];
  document.getElementById("doneWhere").textContent = fromBranch
    ? "BRANCH COMPLETE"
    : "SHEET COMPLETE";
  document.getElementById("doneBody").textContent = fromBranch
    ? "You closed the loop inside a branch, so its premise was right all along. Nobody else can see it until you put it on the puzzle."
    : "Every clue is satisfied and the loop is a single closed circuit.";
  document.getElementById("doneStats").innerHTML = stats
    .map(([k, v]) => `<span>${k}<b>${v}</b></span>`)
    .join("");
  document.getElementById("donePromote").hidden = !fromBranch;
  el.hidden = false;
}

document.getElementById("doneStay").onclick = () => {
  document.getElementById("done").hidden = true;
};
/* The controls are worth reading once and then in the way. Whether they are
   folded away is remembered per browser. */
(function wireControls() {
  const btn = document.getElementById("ctrlToggle");
  if (!btn) return;
  const block = btn.closest(".block");
  const apply = shut => {
    block.classList.toggle("block--shut", shut);
    btn.textContent = shut ? "show" : "hide";
    btn.setAttribute("aria-expanded", String(!shut));
  };
  let shut = false;
  try {
    shut = window.localStorage.getItem("sl:controls") === "shut";
  } catch (e) {}
  apply(shut);
  btn.onclick = e => {
    e.stopPropagation();
    shut = !shut;
    apply(shut);
    try {
      window.localStorage.setItem("sl:controls", shut ? "shut" : "open");
    } catch (e) {}
  };
})();

document.getElementById("creditsBtn").onclick = () => {
  document.getElementById("credits").hidden = false;
};
document.getElementById("creditsClose").onclick = () => {
  document.getElementById("credits").hidden = true;
};
document.addEventListener("keydown", e => {
  if (e.key === "Escape") document.getElementById("credits").hidden = true;
});
document.getElementById("doneNew").onclick = () => {
  document.getElementById("done").hidden = true;
  if (!isOwner()) {
    toast("Only " + ownerLabel() + " can change this puzzle — leave to start your own");
    return;
  }
  clearBranches();
  openSetup(true);
};
/* a completed branch is proven, not a guess, so it may go on the sheet */
document.getElementById("donePromote").onclick = () => {
  document.getElementById("done").hidden = true;
  if (!trial) return;
  const solved = { edges: room.edges, cells: room.cells, diag: room.diag };
  const node = trial;
  clearBranches();
  const steps = [];
  for (let i = 0; i < engine.E; i++)
    if (solved.edges[i] !== room.edges[i])
      steps.push({ e: i, from: room.edges[i], to: solved.edges[i] });
  for (let k = 0; k < engine.NC; k++) {
    if (solved.cells[k] !== room.cells[k])
      steps.push({ k, from: room.cells[k], to: solved.cells[k] });
    if (solved.diag[k] !== room.diag[k])
      steps.push({ d: k, from: room.diag[k], to: solved.diag[k] });
  }
  for (const st of steps) applyStep(st, st.to);
  if (steps.length) {
    undoStack.push(steps);
    redoStack = [];
  }
  void node;
  render();
  flush();
  toast("Solution put on the puzzle");
};

function celebrate() {
  toast("Loop closed. Nice work.");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // trace the finished loop once, in order
  const { VC: DOT_COUNT } = engine;
  const adj = [];
  for (let v = 0; v < DOT_COUNT; v++) adj.push([]);
  for (let i = 0; i < engine.E; i++)
    if (room.edges[i] === "1") {
      adj[engine.ea[i]].push(engine.eb[i]);
      adj[engine.eb[i]].push(engine.ea[i]);
    }
  let start = -1;
  for (let v = 0; v < DOT_COUNT; v++)
    if (adj[v].length) {
      start = v;
      break;
    }
  if (start < 0) return;
  const pts = [start];
  let prev = -1,
    cur = start;
  for (let n = 0; n < engine.E * 2; n++) {
    const nx = adj[cur].find(w => w !== prev);
    if (nx === undefined) break;
    prev = cur;
    cur = nx;
    if (cur === start) break;
    pts.push(cur);
  }
  const C1 = engine.C + 1;
  const d =
    "M" +
    pts.map(v => `${PAD + (v % C1) * CELL},${PAD + ((v / C1) | 0) * CELL}`).join("L") +
    "Z";
  traceEl.setAttribute("d", d);
  const len = traceEl.getTotalLength();
  traceEl.style.strokeDasharray = `${len * 0.14} ${len}`;
  traceEl.style.strokeDashoffset = len;
  traceEl.animate([{ strokeDashoffset: len }, { strokeDashoffset: -len * 0.15 }], {
    duration: 2200,
    easing: "cubic-bezier(.4,0,.2,1)",
  }).onfinish = () => traceEl.setAttribute("d", "");
}
