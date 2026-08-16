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
  const players = [...((room && room.players) || [])].filter(player => player && player.id);
  players.sort((a, btn) => (a.id < btn.id ? -1 : a.id > btn.id ? 1 : 0));
  const used = new Set();
  // anyone who picked a colour keeps it; the rest are placed around them
  for (const player of players) {
    if (player.pen === undefined || player.pen === null) continue;
    const state = ((player.pen % PENS.length) + PENS.length) % PENS.length;
    if (used.has(state)) continue;
    used.add(state);
    penMap.set(penSlot(player.id), state);
  }
  for (const player of players) {
    const h = penSlot(player.id);
    if (penMap.has(h)) continue;
    // only the coloured pens are handed out; graphite is chosen, never given
    let state = h % AUTO_PENS;
    for (let i = 0; i < AUTO_PENS && used.has(state); i++) state = (state + 1) % AUTO_PENS;
    used.add(state);
    penMap.set(h, state);
  }
}
function penVar(idx) {
  if (idx < 0) return "var(--graphite)";
  const state = penMap && penMap.has(idx) ? penMap.get(idx) : idx % AUTO_PENS;
  return `var(${PENS[state]})`;
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
  const mk = (node, a) => {
    const el = document.createElementNS(NS, node);
    for (const cell in a) el.setAttribute(cell, a[cell]);
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

  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const r = (cell / C) | 0,
      c = cell % C;
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
    const tick = mk("text", {
      x: PAD + c * CELL + CELL / 2,
      y: PAD + r * CELL + CELL / 2 + CELL * 0.185,
      class: "clue",
      "font-size": CELL * 0.5,
    });
    gClue.appendChild(tick);
    clueEls.push(tick);
  }
  for (let i = 0; i < EDGE_COUNT; i++) {
    const other = edgeGeom(i);
    const ln = mk("line", { x1: other.x1, y1: other.y1, x2: other.x2, y2: other.y2, class: "seg" });
    gSeg.appendChild(ln);
    segEls.push(ln);
    const mx = (other.x1 + other.x2) / 2,
      my = (other.y1 + other.y2) / 2,
      dotEl = CELL * 0.105;
    const xx = mk("g", { class: "xm" });
    xx.appendChild(mk("line", { x1: mx - dotEl, y1: my - dotEl, x2: mx + dotEl, y2: my + dotEl }));
    xx.appendChild(mk("line", { x1: mx - dotEl, y1: my + dotEl, x2: mx + dotEl, y2: my - dotEl }));
    gX.appendChild(xx);
    xEls.push(xx);
  }
  for (let dot = 0; dot < DOT_COUNT; dot++) {
    const r = (dot / (C + 1)) | 0,
      c = dot % (C + 1);
    const dotEl = mk("circle", { cx: PAD + c * CELL, cy: PAD + r * CELL, r: 1.9, class: "dot" });
    gDot.appendChild(dotEl);
    dotEls.push(dotEl);
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
    // dots sit under the lines: a line should run through them, not stop at
    // a bead sitting on top of it
    gBoard, gFill, gDiag, gBad, gDot, gX, gSegGhost, gSeg, gRel, premGroup, gClue, traceEl,
  );
}

/* nearest segment to a point, or -1 */
function edgeAt(xx, yy) {
  const { R, C } = engine;
  const col = (xx - PAD) / CELL,
    row = (yy - PAD) / CELL;
  let best = -1,
    bestD = Infinity;
  const consider = i => {
    if (i < 0) return;
    const other = edgeGeom(i);
    // distance from point to the segment
    const dx = other.x2 - other.x1,
      dy = other.y2 - other.y1;
    const tick = Math.max(
      0,
      Math.min(1, ((xx - other.x1) * dx + (yy - other.y1) * dy) / (dx * dx + dy * dy)),
    );
    const px = other.x1 + tick * dx,
      py = other.y1 + tick * dy;
    const dotEl = Math.hypot(xx - px, yy - py);
    if (dotEl < bestD) {
      bestD = dotEl;
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

function cellSatisfied(cell) {
  const want = room.clues[cell];
  if (want < 0) return 0;
  let on = 0;
  for (let j = 0; j < 4; j++) if (room.edges[engine.cEdge[cell * 4 + j]] === "1") on++;
  return on > want ? 2 : on === want ? 1 : 0;
}

/* A puzzle can be finished by colouring rather than drawing: if every square
   has a side, the border between the colours is a loop, and that loop meets
   the clues, the puzzle is solved with no line drawn.

   Which colour means "inside" is the player's choice, so both readings are
   built and whichever one is a solution wins. */
function edgesFromColours(cells, blueInside) {
  cells = cells || room.cells;
  if (!cells) return null;
  const { R, C, E: EDGE_COUNT, NC: CELL_COUNT } = engine;
  for (let cell = 0; cell < CELL_COUNT; cell++) if (cells[cell] === "0") return null;

  // inside(k) is true for squares the loop encloses; off the board is outside
  const inside = cell => (cell < 0 ? false : (cells[cell] === "1") === !!blueInside);
  const out = new Array(EDGE_COUNT).fill("2");
  for (let r = 0; r <= R; r++)
    for (let c = 0; c < C; c++)
      out[engine.H(r, c)] =
        inside(r > 0 ? (r - 1) * C + c : -1) !== inside(r < R ? r * C + c : -1) ? "1" : "2";
  for (let r = 0; r < R; r++)
    for (let c = 0; c <= C; c++)
      out[engine.V(r, c)] =
        inside(c > 0 ? r * C + c - 1 : -1) !== inside(c < C ? r * C + c : -1) ? "1" : "2";
  return out.join("");
}

/* The colouring read as a finished puzzle, or null if it is not one. */
function solvedByColour(cells) {
  for (const blueInside of [true, false]) {
    const edges = edgesFromColours(cells, blueInside);
    if (!edges) return null;
    const st = loopStatus(edges);
    if (st.solved) return { edges, info: st };
  }
  return null;
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
  for (let dot = 0; dot < DOT_COUNT; dot++) {
    if (deg[dot] !== 0 && deg[dot] !== 2) return { on, solved: false };
    if (deg[dot]) withDeg++;
  }
  const seen = new Uint8Array(DOT_COUNT);
  const st = [anyV];
  seen[anyV] = 1;
  let reached = 1;
  while (st.length) {
    const dot = st.pop();
    for (let j = 0; j < engine.vDeg[dot]; j++) {
      const edge = engine.vEdge[dot * 4 + j];
      if (edges[edge] !== "1") continue;
      const other = engine.ea[edge] === dot ? engine.eb[edge] : engine.ea[edge];
      if (!seen[other]) {
        seen[other] = 1;
        reached++;
        st.push(other);
      }
    }
  }
  if (reached !== withDeg) return { on, solved: false };
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const want = room.clues[cell];
    if (want < 0) continue;
    let c = 0;
    for (let j = 0; j < 4; j++) if (edges[engine.cEdge[cell * 4 + j]] === "1") c++;
    if (c !== want) return { on, solved: false };
  }
  return { on, solved: true };
}

let dimClues = true,
  weighted = false;

function render() {
  keepMasterFresh();   // branches derive from the master; keep it current
  if (!room || !engine) return;
  const { E: EDGE_COUNT, NC: CELL_COUNT } = engine;
  /* Pen colours exist to tell people apart. On your own there is nobody to
     tell apart, so the board reads better in plain graphite. */
  /* On your own the board reads better in plain graphite — unless you have
     actually chosen a colour, in which case ignoring it looks broken. */
  const mine = (room.players || []).find(player => player.id === me.id);
  const chosePen = !!(mine && mine.pen !== undefined && mine.pen !== null);
  /* Graphite is for a puzzle that has only ever had one person on it. Once
     somebody else has drawn here the colours mean something, and dropping
     them the moment they step away rewrites what is on the board. */
  const soloPen = !chosePen && (room.players || []).length < 2;
  buildPenMap();

  for (let i = 0; i < EDGE_COUNT; i++) {
    const state = room.edges[i];
    const seg = segEls[i];
    if (state === "1") {
      seg.classList.add("on");
      seg.setAttribute("stroke", soloPen ? "var(--graphite)" : penVar(room.eo[i]));
      // drawn lines belong on top of the undecided grid, so lift them into the
      // upper group rather than relying on edge order
      if (gSegDrawn && seg.parentNode !== gSegDrawn) gSegDrawn.appendChild(seg);
    } else {
      seg.classList.remove("on");
      /* Keep an undecided line faint even while it is fading out. It used to
         hold on to the black stroke from when it was drawn, which flashed
         across the board when the absent-lines view was switched off. */
      seg.setAttribute("stroke", "var(--ghost)");
      if (gSegGhost && seg.parentNode !== gSegGhost) gSegGhost.appendChild(seg);
    }
    xEls[i].classList.toggle("on", state === "2");
    if (state === "2") {
      const col = soloPen ? "var(--x-mark)" : penVar(room.eo[i]);
      for (const ln of xEls[i].children) ln.setAttribute("stroke", col);
    }
    seg.classList.toggle("off", state === "2"); // "ruled out" in the weighted view
  }
  ensureCells(room);
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const mark = room.cells[cell],
      fillEl = fillEls[cell];
    if (!fillEl) continue;
    if (mark === "1" || mark === "2") {
      fillEl.setAttribute("fill", MARK_FILL[mark]);
      fillEl.classList.add("on");
    } else fillEl.classList.remove("on");
  }
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const want = room.clues[cell],
      el = clueEls[cell];
    if (want < 0) {
      el.textContent = "";
      continue;
    }
    el.textContent = want;
    const state = cellSatisfied(cell);
    el.classList.toggle("done", dimClues && state === 1);
    el.classList.toggle("over", state === 2);
  }
  /* Finishing by colour counts too: if every square is coloured and the border
     between the colours is a loop that satisfies the clues, the puzzle is
     solved whether or not the lines were drawn. */
  let info = loopStatus();
  if (!info.solved) {
    const byColour = solvedByColour();
    if (byColour) info = byColour.info;
  }
  // only worth saying when it is worth saying; the counts live in Progress
  // info is fresh; room.solvedAt is only set further down, so reading that
  // alone left the line blank on the very render that finished the puzzle
  document.getElementById("statline").textContent =
    room.solvedAt || info.solved ? "Loop closed — puzzle complete" : "";
  /* "20×20 · Maximal · minimal" told you the difficulty twice in words that
     look like they disagree. Say the size, the difficulty, and how many clues
     you actually have. */
  const clueCount = room.given != null ? room.given : room.clues.filter(v => v >= 0).length;
  document.getElementById("sizeline").textContent =
    `${room.R}×${room.C} · ${(DIFFS[room.diff] || {}).label || room.diff} · ${clueCount} clues`;

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
  const mid = cell => ({
    x: PAD + (cell % engine.C) * CELL + CELL / 2,
    y: PAD + ((cell / engine.C) | 0) * CELL + CELL / 2,
  });
  for (const key in room.rels) {
    const [a, btn] = key.split(":").map(Number);
    if (!(a >= 0 && btn >= 0 && a < engine.NC && btn < engine.NC)) continue;
    const player = mid(a),
      other = mid(btn);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", player.x);
    line.setAttribute("y1", player.y);
    line.setAttribute("x2", other.x);
    line.setAttribute("y2", other.y);
    line.setAttribute("class", "rel rel--" + room.rels[key]);
    gRel.appendChild(line);
    if (room.rels[key] === "d") {
      // a break, meaning "not the same"
      const cx = (player.x + other.x) / 2,
        cy = (player.y + other.y) / 2;
      const dx = other.x - player.x,
        dy = other.y - player.y,
        len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * CELL * 0.16,
        ny = (dx / len) * CELL * 0.16;
      const tick = document.createElementNS(NS, "line");
      tick.setAttribute("x1", cx - nx);
      tick.setAttribute("y1", cy - ny);
      tick.setAttribute("x2", cx + nx);
      tick.setAttribute("y2", cy + ny);
      tick.setAttribute("class", "rel rel--tick");
      gRel.appendChild(tick);
    }
  }
}

function paintDiagonals() {
  if (!gDiag) return;
  while (gDiag.firstChild) gDiag.removeChild(gDiag.firstChild);
  ensureCells(room);
  const NS = "http://www.w3.org/2000/svg",
    pad = 0; // corner to corner
  for (let cell = 0; cell < engine.NC; cell++) {
    const mark = room.diag[cell];
    if (mark === "0") continue;
    const r = (cell / engine.C) | 0,
      c = cell % engine.C,
      xx = PAD + c * CELL,
      yy = PAD + r * CELL;
    const line = document.createElementNS(NS, "line");
    if (mark === "1") {
      line.setAttribute("x1", xx + pad);
      line.setAttribute("y1", yy + pad);
      line.setAttribute("x2", xx + CELL - pad);
      line.setAttribute("y2", yy + CELL - pad);
    } else {
      line.setAttribute("x1", xx + CELL - pad);
      line.setAttribute("y1", yy + pad);
      line.setAttribute("x2", xx + pad);
      line.setAttribute("y2", yy + CELL - pad);
    }
    line.setAttribute("class", "dg");
    gDiag.appendChild(line);
  }
}

/* Your name and colour are yours to change, at any point, without leaving the
   puzzle. The colour is stored as a chosen pen slot; everyone else's is worked
   out from their id, so choosing one only shifts somebody else if they had the
   same one. */
function setMyName(name) {
  const clean = String(name || "").trim().slice(0, 24);
  if (!clean || !room) return false;
  me.name = clean;
  try {
    window.localStorage.setItem("sl:me", JSON.stringify(me));
  } catch (edge) {}
  const player = room.players.find(other => other.id === me.id);
  if (player) {
    player.name = clean;
    player.seen = now();
  }
  flushSoon();
  render();
  return true;
}

function setMyPen(slot) {
  if (!room) return false;
  const player = room.players.find(other => other.id === me.id);
  if (!player) return false;
  player.pen = slot;
  player.seen = now();
  try {
    window.localStorage.setItem("sl:pen", String(slot));
  } catch (edge) {}
  flushSoon();
  render();
  return true;
}

function renderRack() {
  const rack = document.getElementById("rack");
  const live = [...room.players].sort((a, btn) => (a.name || "").localeCompare(btn.name || ""));
  rack.innerHTML = "";
  live.forEach(player => {
    const idx = penSlot(player.id); // same rule the board uses
    void idx;
    const idle = now() - player.seen > IDLE_MS;
    const el = document.createElement("div");
    el.className = "pen" + (player.id === me.id ? " pen--you" : "") + (idle ? " pen--idle" : "");
    el.style.setProperty("--pen", penVar(penSlot(player.id)));
    el.innerHTML = `<div class="pen__barrel"></div><div class="pen__meta">
      <span class="pen__name"></span></div>`;
    el.querySelector(".pen__name").textContent = player.name + (player.id === me.id ? " (you)" : "");
    /* Your own row is the control: the name changes your name, the pencil
       changes your colour. A separate button was one more thing to find. */
    if (player.id === me.id) {
      el.classList.add("pen--mine");
      const nameEl = el.querySelector(".pen__name");
      nameEl.title = "click to change your name";
      nameEl.onclick = () => editMyName();
      const barrel = el.querySelector(".pen__barrel");
      barrel.title = "click to change your colour";
      barrel.onclick = () => choosePen(barrel);
    }
    rack.appendChild(el);
  });
  const online = room.players.filter(player => now() - player.seen < IDLE_MS).length;
  document.getElementById("onlinecount").textContent = online + " here";
}

function renderReadout(info) {
  const total = room.clues.filter(dot => dot >= 0).length;
  let done = 0;
  for (let cell = 0; cell < engine.NC; cell++) if (room.clues[cell] >= 0 && cellSatisfied(cell) === 1) done++;
  const el = document.getElementById("readout");
  el.innerHTML =
    `Clues met <b>${done}</b> of <b>${total}</b><br>` +
    `Segments <b>${info.on}</b> · X marks <b>${[...room.edges].filter(c => c === "2").length}</b>`;
  document.getElementById("progbar").style.width = (total ? (done / total) * 100 : 0) + "%";
}

let doneAt = 0;
function fmtClock(ms) {
  const tick = Math.max(0, Math.round(ms / 1000));
  const mark = Math.floor(tick / 60);
  return mark ? `${mark}m ${String(tick % 60).padStart(2, "0")}s` : `${tick}s`;
}

function showDone(fromBranch) {
  const el = document.getElementById("done");
  const started = room.gen || doneAt || Date.now();
  const stats = [
    ["Grid", `${room.R}×${room.C}`],
    ["Clues", String(room.given != null ? room.given : room.clues.filter(dot => dot >= 0).length)],
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
    .map(([cell, dot]) => `<span>${cell}<b>${dot}</b></span>`)
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
  } catch (edge) {}
  apply(shut);
  btn.onclick = edge => {
    edge.stopPropagation();
    shut = !shut;
    apply(shut);
    try {
      window.localStorage.setItem("sl:controls", shut ? "shut" : "open");
    } catch (edge) {}
  };
})();

document.getElementById("creditsBtn").onclick = () => {
  document.getElementById("credits").hidden = false;
};
document.getElementById("creditsClose").onclick = () => {
  document.getElementById("credits").hidden = true;
};
document.addEventListener("keydown", edge => {
  if (edge.key === "Escape") document.getElementById("credits").hidden = true;
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
/* a completed branch is proven, not a guess, so it may go on the master */
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
  for (let cell = 0; cell < engine.NC; cell++) {
    if (solved.cells[cell] !== room.cells[cell])
      steps.push({ k: cell, from: room.cells[cell], to: solved.cells[cell] });
    if (solved.diag[cell] !== room.diag[cell])
      steps.push({ d: cell, from: room.diag[cell], to: solved.diag[cell] });
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
  for (let dot = 0; dot < DOT_COUNT; dot++) adj.push([]);
  for (let i = 0; i < engine.E; i++)
    if (room.edges[i] === "1") {
      adj[engine.ea[i]].push(engine.eb[i]);
      adj[engine.eb[i]].push(engine.ea[i]);
    }
  let start = -1;
  for (let dot = 0; dot < DOT_COUNT; dot++)
    if (adj[dot].length) {
      start = dot;
      break;
    }
  if (start < 0) return;
  const pts = [start];
  let prev = -1,
    cur = start;
  for (let node = 0; node < engine.E * 2; node++) {
    const nx = adj[cur].find(other => other !== prev);
    if (nx === undefined) break;
    prev = cur;
    cur = nx;
    if (cur === start) break;
    pts.push(cur);
  }
  const C1 = engine.C + 1;
  const dotEl =
    "M" +
    pts.map(dot => `${PAD + (dot % C1) * CELL},${PAD + ((dot / C1) | 0) * CELL}`).join("L") +
    "Z";
  traceEl.setAttribute("d", dotEl);
  const len = traceEl.getTotalLength();
  traceEl.style.strokeDasharray = `${len * 0.14} ${len}`;
  traceEl.style.strokeDashoffset = len;
  traceEl.animate([{ strokeDashoffset: len }, { strokeDashoffset: -len * 0.15 }], {
    duration: 2200,
    easing: "cubic-bezier(.4,0,.2,1)",
  }).onfinish = () => traceEl.setAttribute("d", "");
}
