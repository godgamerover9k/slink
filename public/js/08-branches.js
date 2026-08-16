/* ============================================================
   6b. Branches — a tree of hypotheses. A branch is never kept:
       it is either abandoned, or disproved, and disproving it
       writes the opposite of its premise onto the branch above.
   ============================================================ */
const trialEls = {
  block: document.getElementById("trialBlock"),
  tag: document.getElementById("trialTag"),
  tree: document.getElementById("trialTree"),
  copy: document.getElementById("trialCopy"),
  start: document.getElementById("trialStart"),
  reject: document.getElementById("trialReject"),
  accept: document.getElementById("trialAccept"),
  rename: document.getElementById("trialRename"),
  drop: document.getElementById("trialDrop"),
};

/* Branches live in the shared sheet so everyone sees them. A branch is stored
   as the marks it *adds* to its parent rather than a whole board, which keeps
   it small enough to sync and means a change made higher up is inherited by
   everything below it for free. */
let branches = new Map(); // id -> live node (mirrors room.tree)
let trunk = { children: [], saved: null, undo: [], redo: [] }; // the master everyone shares
let showPremises = true;
/* `trial` (declared with the room state) holds the active node, or null on the sheet.
   Everything that pauses syncing keys off it, so the sheet only moves when null. */

const FLIP = { 1: "2", 2: "1" };
const negate = player => (player.to === "0" ? player.from : FLIP[player.to]);

function boardSnapshot() {
  ensureCells(room);
  return {
    edges: room.edges,
    cells: room.cells,
    diag: room.diag,
    rels: Object.assign({}, room.rels),
    eo: room.eo.slice(),
  };
}
function loadSnapshot(snap) {
  room.edges = snap.edges;
  room.cells = snap.cells;
  room.eo = snap.eo.slice();
  if (typeof snap.diag === "string") room.diag = snap.diag;
  if (snap.rels) room.rels = Object.assign({}, snap.rels);
}

/* ---- shared tree: room.tree is a flat map of id -> branch record ---- */
const MARK_KEY = { edge: "e", cell: "k", diag: "d", rel: "r" };
const MARK_STR = { e: "edges", k: "cells", d: "diag" };

function ensureTree(r) {
  if (!r.tree || typeof r.tree !== "object") r.tree = {};
  return r.tree;
}
function newBranchId() {
  return (me && me.id ? me.id.slice(0, 6) : "anon") + "-" + now().toString(36);
}
function treeRec(node) {
  return {
    id: node.id,
    parent: node.parent,
    premise: node.premise,
    marks: node.marks,
    by: node.by,
    byId: node.byId,
    at: node.at,
    mt: node.mt || {},
    mo: node.mo || {},
    made: node.made || node.at,
    ord: node.ord,
    ordAt: node.ordAt || 0,
    name: node.name || "",
    nameAt: node.nameAt || 0,
    dead: !!node.dead,
  };
}
function pushTree(node) {
  if (!room) return;
  ensureTree(room);
  node.at = now();
  room.tree[node.id] = treeRec(node);
  if (!trial) flushSoon();
  else flushSoon(); // tree edits always sync
}
function flushSoon() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_MS);
}

/* rebuild the live node map from the shared record */
function syncTreeFromRoom() {
  if (!room) return;
  ensureTree(room);
  const keepId = trial ? trial.id : null;
  branches = new Map();
  trunk.children = [];
  for (const id in room.tree) {
    const r = room.tree[id];
    if (r.dead) continue;
    branches.set(id, {
      id,
      parent: r.parent,
      children: [],
      premise: r.premise,
      marks: r.marks || { e: {}, k: {}, d: {} },
      by: r.by,
      byId: r.byId,
      at: r.at,
      ord: r.ord,
      ordAt: r.ordAt || 0,
      nameAt: r.nameAt || 0,
      mt: r.mt || {},
      mo: r.mo || {},
      made: r.made || r.at,
      name: r.name || "",
      undo: [],
      redo: [],
      doneShown: false,
    });
  }
  for (const node of branches.values()) {
    const par = node.parent ? branches.get(node.parent) : null;
    if (node.parent && !par) {
      branches.delete(node.id);
      continue;
    } // orphan
    (par ? par.children : trunk.children).push(node.id);
  }
  const key = id => {
    const node = branches.get(id);
    if (node.ord !== undefined && node.ord !== null) return node.ord;
    return node.made || node.at || 0;        // when it was made, not when last touched
  };
  const sortAt = ids => ids.sort((first, btn) => key(first) - key(btn));
  sortAt(trunk.children);
  for (const node of branches.values()) sortAt(node.children);
  if (keepId) {
    const still = branches.get(keepId);
    trial = still || null;
    document.body.classList.toggle("trialing", !!trial);
  }
}

/* the board a branch shows: the sheet, plus every ancestor's marks, plus its own */
function chainOf(node) {
  const chain = [];
  for (let n = node; n; n = n.parent ? branches.get(n.parent) : null) chain.unshift(n);
  return chain;
}
/* The master board. It is kept up to date by render while no branch is open
   (see keepMasterFresh), so this never has to guess from whatever the room
   happens to be showing — which broke when a branch was mid-switch. */
function sheetBoard() {
  return trunk.saved || boardSnapshot();
}

/* Called from render. While no branch is open the room *is* the master, so
   the snapshot branches derive from is refreshed here rather than only when
   a branch is opened, which left it stale. */
function keepMasterFresh() {
  if (!trial && room) trunk.saved = boardSnapshot();
}

function baseBoardOf(node) {
  const par = node && node.parent ? branches.get(node.parent) : null;
  return par ? deriveBoard(par) : sheetBoard();
}
function refreshBase() {
  if (trial) trial.baseBoard = baseBoardOf(trial);
}

function deriveBoard(node) {
  const base = sheetBoard();
  let edges = base.edges,
    cells = base.cells,
    diag = base.diag;
  const rels = Object.assign({}, base.rels || {});
  const put = (str, idx, val) => str.slice(0, idx) + val + str.slice(idx + 1);
  for (const n of chainOf(node)) {
    const mark = n.marks || {};
    for (const i in mark.e || {}) edges = put(edges, +i, mark.e[i]);
    for (const i in mark.k || {}) cells = put(cells, +i, mark.k[i]);
    for (const i in mark.d || {}) diag = put(diag, +i, mark.d[i]);
    for (const key in mark.r || {}) {
      if (mark.r[key] === "0") delete rels[key];
      else rels[key] = mark.r[key];
    }
  }
  const eo = base.eo ? base.eo.slice() : room.eo.slice();
  for (const n of chainOf(node)) {
    /* A line belongs to whoever drew it, not to whoever started the branch —
       using the branch owner repainted other people's marks a moment after
       they made them. Older branches have no per-mark owner, so fall back. */
    const fallback = n.byId ? penSlot(n.byId) : -1;
    const owners = (n.mo || {}).e || {};
    for (const i in (n.marks || {}).e || {})
      if (n.marks.e[i] === "1") eo[+i] = owners[i] !== undefined ? owners[i] : fallback;
  }
  return { edges, cells, diag, rels, eo };
}
function recordMark(node, kind, idx, val) {
  const key = MARK_KEY[kind];
  if (!node.marks) node.marks = { e: {}, k: {}, d: {} };
  if (!node.marks[key]) node.marks[key] = {};
  if (!node.mt) node.mt = {};
  if (!node.mt[key]) node.mt[key] = {};
  if (!node.mo) node.mo = {};
  if (!node.mo[key]) node.mo[key] = {};
  node.marks[key][idx] = val;
  node.mt[key][idx] = now();              // when, so writes can be merged
  node.mo[key][idx] = penSlot(me.id);     // who, so it keeps their colour
  pushTree(node);
}

/* Merge one branch record into another, mark by mark. Whole-record
   last-write-wins threw away whatever the other person had just done. */
function mergeBranchRecord(into, from) {
  if (!from) return into;
  if (!into) return { ...from };
  const out = { ...into };
  // the branch's own details follow the newer record
  if ((from.at || 0) > (into.at || 0)) {
    out.premise = from.premise;
    out.parent = from.parent;
    out.dead = from.dead;
    out.at = from.at;
  }
  /* Order and name are changed on their own, so they carry their own times.
     Riding on the record's timestamp meant a mark written a moment later put
     the branch back where it was. */
  if ((from.ordAt || 0) > (into.ordAt || 0)) {
    out.ord = from.ord;
    out.ordAt = from.ordAt;
  }
  if ((from.nameAt || 0) > (into.nameAt || 0)) {
    out.name = from.name;
    out.nameAt = from.nameAt;
  }
  out.made = Math.min(into.made || into.at || 0, from.made || from.at || 0) || out.made;
  out.marks = { ...(into.marks || {}) };
  out.mt = { ...(into.mt || {}) };
  out.mo = { ...(into.mo || {}) };
  for (const kind of ["e", "k", "d", "r"]) {
    const mine = { ...((into.marks || {})[kind] || {}) };
    const mineT = { ...((into.mt || {})[kind] || {}) };
    const mineO = { ...((into.mo || {})[kind] || {}) };
    const theirs = (from.marks || {})[kind] || {};
    const theirsT = (from.mt || {})[kind] || {};
    const theirsO = (from.mo || {})[kind] || {};
    for (const idx in theirs) {
      const tTheirs = theirsT[idx] || from.at || 0;
      const tMine = mineT[idx] === undefined ? -1 : mineT[idx];
      if (idx in mine && tMine >= tTheirs) continue;
      mine[idx] = theirs[idx];
      mineT[idx] = tTheirs;
      if (theirsO[idx] !== undefined) mineO[idx] = theirsO[idx];
    }
    out.marks[kind] = mine;
    out.mt[kind] = mineT;
    out.mo[kind] = mineO;
  }
  return out;
}

/* Branches derive from their parent, so a mark added above is inherited
   below automatically; nothing needs pushing down. */
function propagateDown() {
  /* children derive from their parent; nothing to push */
}
const slotOf = node => node || trunk;
const parentOf = node => (node && node.parent != null ? branches.get(node.parent) : null);

function cellName(cell) {
  return "r" + (((cell / engine.C) | 0) + 1) + "c" + ((cell % engine.C) + 1);
}

function cellsAtVert(value, into) {
  const C = engine.C,
    r = (value / (C + 1)) | 0,
    c = value % (C + 1);
  const add = (rr, cc) => {
    if (rr >= 0 && cc >= 0 && rr < engine.R && cc < engine.C) into.add(rr * C + cc);
  };
  add(r - 1, c - 1);
  add(r - 1, c);
  add(r, c - 1);
  add(r, c);
}

/* the cheap structural contradictions, found without any search.
   `st` lets a parked branch be judged without loading it. */
function findTrouble(st) {
  const edges = (st || room).edges,
    cells = (st || room).cells;
  void cells;
  const bad = new Set(),
    msgs = [];
  if (!edges) return { bad, msgs, solved: false };
  const { E: EDGE_COUNT, VC: DOT_COUNT, NC: CELL_COUNT } = engine,
    deg = new Int8Array(DOT_COUNT);
  let anyLine = false;
  for (let i = 0; i < EDGE_COUNT; i++)
    if (edges[i] === "1") {
      deg[engine.ea[i]]++;
      deg[engine.eb[i]]++;
      anyLine = true;
    }
  for (let value = 0; value < DOT_COUNT; value++)
    if (deg[value] > 2) {
      msgs.push("three lines meet at one dot");
      cellsAtVert(value, bad);
    }
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const want = room.clues[cell];
    if (want < 0) continue;
    let on = 0,
      free = 0;
    for (let j = 0; j < 4; j++) {
      const c = edges[engine.cEdge[cell * 4 + j]];
      if (c === "1") on++;
      else if (c === "0") free++;
    }
    if (on > want) {
      bad.add(cell);
      msgs.push("a clue has more lines than its number");
    } else if (on + free < want) {
      bad.add(cell);
      msgs.push("a clue can no longer reach its number");
    }
  }
  /* Everything the board says about which side of the loop a square is on,
     resolved together: a drawn line means the squares either side are on
     opposite sides, a ruled-out edge means they are on the same side, a colour
     pins a square to one side outright, and the player's own claims tie two
     squares together. Union-find with a parity bit, so a contradiction
     anywhere in the chain is found rather than only between neighbours. */
  {
    const C = engine.C,
      N = CELL_COUNT + 1,
      OUT = CELL_COUNT; // one extra node standing for "blue"
    const parent = new Int32Array(N),
      rank = new Int32Array(N),
      par = new Uint8Array(N);
    for (let i = 0; i < N; i++) parent[i] = i;
    const find = x => {
      // returns [root, parity to root]
      let player = 0,
        r = x;
      while (parent[r] !== r) {
        player ^= par[r];
        r = parent[r];
      }
      let cur = x,
        cp = player;
      while (parent[cur] !== cur) {
        // path compression, parity kept
        const nx = parent[cur],
          np = cp ^ par[cur];
        parent[cur] = r;
        par[cur] = cp;
        cur = nx;
        cp = np;
      }
      return [r, player];
    };
    const join = (first, btn, diff, why) => {
      const [ra, pa] = find(first),
        [rb, pb] = find(btn);
      if (ra === rb) {
        if (((pa ^ pb) & 1) !== (diff & 1)) {
          bad.add(first < CELL_COUNT ? first : btn);
          if (btn < CELL_COUNT) bad.add(btn);
          msgs.push(why);
        }
        return;
      }
      const need = (pa ^ pb ^ diff) & 1;
      if (rank[ra] < rank[rb]) {
        parent[ra] = rb;
        par[ra] = need;
      } else {
        parent[rb] = ra;
        par[rb] = need;
        if (rank[ra] === rank[rb]) rank[ra]++;
      }
    };

    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const r = (cell / C) | 0,
        c = cell % C;
      if (c + 1 < C) {
        const edge = engine.V(r, c + 1);
        if (edges[edge] === "1") join(cell, cell + 1, 1, "a line has the same colour on both sides");
        else if (edges[edge] === "2")
          join(cell, cell + 1, 0, "two colours meet with no line between them");
      }
      if (r + 1 < engine.R) {
        const edge = engine.H(r + 1, c);
        if (edges[edge] === "1") join(cell, cell + C, 1, "a line has the same colour on both sides");
        else if (edges[edge] === "2")
          join(cell, cell + C, 0, "two colours meet with no line between them");
      }
      const col = cells ? cells[cell] : "0";
      if (col === "1") join(cell, OUT, 0, "a colour disagrees with the lines around it");
      else if (col === "2") join(cell, OUT, 1, "a colour disagrees with the lines around it");
    }
    const rels = (st || room).rels || {};
    for (const key in rels) {
      const [first, btn] = key.split(":").map(Number);
      if (!(first >= 0 && btn >= 0 && first < CELL_COUNT && btn < CELL_COUNT)) continue;
      join(
        first,
        btn,
        rels[key] === "d" ? 1 : 0,
        rels[key] === "d"
          ? "two squares claimed opposite are forced the same"
          : "two squares claimed alike are forced apart",
      );
    }
  }

  const info = loopStatus(edges);
  if (anyLine && !info.solved) {
    let closed = true;
    for (let value = 0; value < DOT_COUNT; value++)
      if (deg[value] !== 0 && deg[value] !== 2) {
        closed = false;
        break;
      }
    if (closed) msgs.push("the loop closes early, leaving the puzzle unfinished");
  }
  return { bad, msgs: [...new Set(msgs)], solved: info.solved };
}

function branchLabel(node) {
  if (!node) return "Master";
  return node.name ? node.name : premiseLabel(node.premise);
}

function renameBranch(node) {
  if (!node) return;
  const given = prompt(
    "Name this branch\n\nLeave it empty to go back to showing its premise.",
    node.name || "",
  );
  if (given === null) return;
  node.name = given.trim().slice(0, 40);
  node.nameAt = now();
  pushTree(node);
  render();
}

function premiseLabel(player) {
  if (!player) return "nothing assumed yet";
  const word =
    player.kind === "cell"
      ? { 1: "blue", 2: "yellow", 0: "cleared" }[player.to]
      : { 1: "line", 2: "×", 0: "cleared" }[player.to];
  if (player.kind === "cell") return cellName(player.idx) + " → " + word;
  const i = player.idx,
    C = engine.C;
  let where;
  if (i < engine.HN) {
    const r = (i / C) | 0,
      c = i % C;
    where = r < engine.R ? cellName(r * C + c) + " top" : cellName((r - 1) * C + c) + " bottom";
  } else {
    const j = i - engine.HN,
      r = (j / (C + 1)) | 0,
      c = j % (C + 1);
    where = c < C ? cellName(r * C + c) + " left" : cellName(r * C + c - 1) + " right";
  }
  return where + " → " + word;
}

/* the premise still has to be on the board for the contradiction to mean anything */
function premiseHolds(node) {
  if (!node || !node.premise) return false;
  const player = node.premise;
  return (player.kind === "cell" ? room.cells[player.idx] : room.edges[player.idx]) === player.to;
}

function notePremise(kind, idx, from, to) {
  if (trial && !trial.premise && from !== to) trial.premise = { kind, idx, from, to };
}

function switchBranch(id) {
  if (!room) return;
  const target = id == null ? null : branches.get(id);
  if (id != null && !target) return;
  if (!trial) trunk.saved = boardSnapshot(); // remember the master as it stands
  (trial || trunk).undo = undoStack;
  (trial || trunk).redo = redoStack;
  trial = target;
  refreshBase();
  trial = null;
  loadSnapshot(target ? deriveBoard(target) : trunk.saved || boardSnapshot());
  undoStack = (target || trunk).undo || [];
  redoStack = (target || trunk).redo || [];
  trial = target;
  document.body.classList.toggle("trialing", !!target);
  render();
}

function createBranch() {
  if (!room || room.solvedAt) return;
  if (!trial && pending.length) flush(); // land real work before the sheet pauses
  const parent = trial;
  if (!trial) trunk.saved = boardSnapshot();
  const node = {
    id: newBranchId(),
    parent: parent ? parent.id : null,
    children: [],
    premise: null,
    marks: { e: {}, k: {}, d: {} },
    by: me ? me.name : "?",
    byId: me ? me.id : null,
    at: now(),
    made: now(),
    undo: [],
    redo: [],
  };
  branches.set(node.id, node);
  (parent || trunk).children.push(node.id);
  pushTree(node);
  switchBranch(node.id);
  toast(parent ? "Branched off " + premiseLabel(parent.premise) : "New branch off the puzzle");
}

function dropSubtree(node) {
  node.children.slice().forEach(id => {
    const c = branches.get(id);
    if (c) dropSubtree(c);
  });
  const holder = parentOf(node) || trunk;
  const at = holder.children.indexOf(node.id);
  if (at >= 0) holder.children.splice(at, 1);
  branches.delete(node.id);
  // a tombstone, so the deletion reaches everyone else too
  ensureTree(room);
  room.tree[node.id] = {
    id: node.id,
    parent: node.parent,
    premise: node.premise,
    marks: null,
    by: node.by,
    at: now(),
    dead: true,
  };
  flushSoon();
}

/* Accepted: the branch's marks move up to its parent and the branch itself
   goes away. Its offshoots are re-parented rather than deleted — their marks
   are stored as differences, and everything this branch added now lives in the
   parent, so they keep meaning exactly what they meant before.

   Note this is an assertion, not a proof: unlike ruling a branch out, nothing
   here has been shown to follow. */
function acceptBranch() {
  const node = trial;
  if (!node) return;
  const marks = node.marks || {};
  const parentId = node.parent;

  const trouble = findTrouble();
  if (
    trouble.msgs.length &&
    !confirm(
      trouble.msgs[0][0].toUpperCase() +
        trouble.msgs[0].slice(1) +
        " on this branch. Accept it onto the puzzle anyway?",
    )
  )
    return;

  for (const id of node.children.slice()) {
    // offshoots hang on the parent now
    const c = branches.get(id);
    if (!c) continue;
    c.parent = parentId;
    const holder = parentId ? branches.get(parentId) : trunk;
    if (holder && holder.children.indexOf(id) < 0) holder.children.push(id);
    pushTree(c);
  }
  node.children = [];
  dropSubtree(node);
  switchBranch(parentId);

  const steps = [];
  for (const i in marks.e || {}) {
    const idx = +i,
      was = room.edges[idx];
    if (was !== marks.e[i] && setEdgeUser(idx, marks.e[i], false))
      steps.push({ e: idx, from: was, to: marks.e[i] });
  }
  for (const i in marks.k || {}) {
    const idx = +i,
      was = room.cells[idx];
    if (was !== marks.k[i] && setCellUser(idx, marks.k[i], false))
      steps.push({ k: idx, from: was, to: marks.k[i] });
  }
  for (const i in marks.d || {}) {
    const idx = +i,
      was = room.diag[idx];
    if (was !== marks.d[i] && setDiagUser(idx, marks.d[i], false))
      steps.push({ d: idx, from: was, to: marks.d[i] });
  }
  if (steps.length) {
    undoStack = undoStack.slice(0, Math.max(0, undoStack.length - steps.length));
    undoStack.push(steps); // one undo takes the lot back
    redoStack = [];
  }
  render();
  flush();
  const where = parentId ? "the branch above" : "the puzzle";
  toast(
    steps.length
      ? `${steps.length} mark${steps.length === 1 ? "" : "s"} accepted onto ${where}`
      : "That branch had nothing to accept",
  );
}

/* disproved: bin the branch and assert the opposite of its premise one level up */
function rejectBranch(deduce) {
  const node = trial;
  if (!node) return;
  const player = node.premise,
    parentId = node.parent;
  const sound = deduce && !!player && premiseHolds(node);
  const kids = node.children.length;
  dropSubtree(node);
  switchBranch(parentId);
  if (sound) {
    const neg = negate(player);
    if (player.kind === "edge") setEdgeUser(player.idx, neg, false);
    else setCellUser(player.idx, neg, false);
    const where = parentId ? "on the branch above" : "on the puzzle";
    toast(premiseLabel(player) + " ruled out — opposite written " + where);
  } else if (deduce) {
    toast("That branch has no premise on the board to rule out");
  } else {
    toast(
      kids
        ? `Branch and its ${kids} offshoot${kids === 1 ? "" : "s"} discarded`
        : "Branch discarded",
    );
  }
}

function clearBranches() {
  branches.clear();
  trunk.children = [];
  if (trial) {
    if (trunk.saved) loadSnapshot(trunk.saved);
    undoStack = trunk.undo || [];
    redoStack = trunk.redo || [];
  }
  trunk.saved = null;
  trunk.undo = [];
  trunk.redo = [];
  trial = null;
  document.body.classList.remove("trialing");
}

/* ---- premise rings: circle the assumption, the way you would on paper ---- */
function paintPremises() {
  if (!premGroup) return;
  while (premGroup.firstChild) premGroup.removeChild(premGroup.firstChild);
  if (!showPremises || !trial) return;
  const NS = "http://www.w3.org/2000/svg";
  const chain = [];
  for (let node = trial; node; node = parentOf(node))
    if (node.premise) chain.push({ p: node.premise, cur: node === trial });
  chain.forEach(({ p: player, cur }) => {
    const el = document.createElementNS(NS, "rect");
    if (player.kind === "cell") {
      const r = (player.idx / engine.C) | 0,
        c = player.idx % engine.C;
      el.setAttribute("x", PAD + c * CELL + 4);
      el.setAttribute("y", PAD + r * CELL + 4);
      el.setAttribute("width", CELL - 8);
      el.setAttribute("height", CELL - 8);
      el.setAttribute("rx", 3);
    } else {
      const other = edgeGeom(player.idx),
        horiz = other.y1 === other.y2,
        pad = 5,
        th = 6.5;
      const x = Math.min(other.x1, other.x2),
        y = Math.min(other.y1, other.y2);
      el.setAttribute("x", horiz ? x + pad : x - th);
      el.setAttribute("y", horiz ? y - th : y + pad);
      el.setAttribute("width", horiz ? CELL - 2 * pad : 2 * th);
      el.setAttribute("height", horiz ? 2 * th : CELL - 2 * pad);
      el.setAttribute("rx", th);
    }
    el.setAttribute("class", "prem" + (cur ? "" : " prem--anc"));
    premGroup.appendChild(el);
  });
}

/* ---- the branch tree in the panel ---- */
/* Branches can be dragged into whatever order makes sense to you, within the
   one parent. Moving between parents would change what a branch means, since
   its marks are stored relative to the branch above, so it is not allowed. */
function reorderBranch(dragId, dropId, after) {
  const first = branches.get(dragId),
    btn = branches.get(dropId);
  if (!first || !btn || first.id === btn.id) return false;
  if ((first.parent || null) !== (btn.parent || null)) return false;
  const holder = (first.parent ? branches.get(first.parent) : trunk).children;
  const from = holder.indexOf(dragId);
  if (from < 0) return false;
  holder.splice(from, 1);
  let to = holder.indexOf(dropId);
  if (to < 0) return false;
  holder.splice(after ? to + 1 : to, 0, dragId);
  holder.forEach((id, i) => {
    const node = branches.get(id);
    if (node && node.ord !== i) {
      node.ord = i;
      node.ordAt = now();      // so a mark written later cannot undo the move
      pushTree(node);
    }
  });
  render();
  return true;
}

/* Which branches are expanded. A view preference, so it stays on this screen
   rather than being shared with everyone else. */
const openBranches = new Set();

/* The branch being worked on is always reachable, however its parents are set. */
function onPathToTrial(id) {
  if (!trial) return false;
  for (let node = trial; node; node = node.parent ? branches.get(node.parent) : null)
    if (node.parent === id) return true;
  return false;
}

function renderTree() {
  const box = trialEls.tree;
  box.innerHTML = "";
  const row = (label, depth, id, flag, premise, kids) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tw";
    btn.style.paddingLeft = 6 + depth * 12 + "px";
    btn.setAttribute("aria-current", id == null ? trial === null : trial && trial.id === id);
    btn.innerHTML = `<span class="tw__rail"></span><span class="tw__label"></span><span class="tw__flag"></span>`;
    btn.querySelector(".tw__rail").textContent = depth ? "└" : "●";
    btn.querySelector(".tw__label").textContent = label;
    const flagEl = btn.querySelector(".tw__flag");
    if (flag) {
      flagEl.textContent = flag.text;
      flagEl.className = "tw__flag " + flag.kind;
    }
    /* Offshoots stay tucked away until you ask for them, with a count so you
       can see there is something under there. */
    if (kids) {
      const twist = document.createElement("span");
      twist.className = "tw__twist";
      twist.textContent = (kids.shut ? "▸ " : "▾ ") + kids.count;
      twist.title = kids.shut ? `show ${kids.count} inside` : "hide what is inside";
      twist.onclick = ev => {
        ev.stopPropagation();
        if (openBranches.has(id)) openBranches.delete(id);
        else openBranches.add(id);
        renderTrial();
      };
      btn.appendChild(twist);
    }
    btn.title = premise || label;
    if (flag && flag.kind === "clash") btn.classList.add("tw--clash");
    btn.onclick = () => switchBranch(id);
    if (id != null)
      btn.ondblclick = ev => {
        ev.preventDefault();
        renameBranch(branches.get(id));
      };
    btn.dataset.branch = id == null ? "" : id;
    if (id != null) {
      btn.draggable = true;
      btn.ondragstart = ev => {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", id);
        btn.classList.add("tw--dragging");
      };
      btn.ondragend = () => {
        btn.classList.remove("tw--dragging");
        box.querySelectorAll(".tw").forEach(r => r.classList.remove("tw--over", "tw--under"));
      };
      btn.ondragover = ev => {
        const from = box.querySelector(".tw--dragging");
        if (!from || from === btn) return;
        const same =
          (branches.get(from.dataset.branch) || {}).parent === (branches.get(id) || {}).parent;
        if (!same) return; // only within the same parent
        ev.preventDefault();
        const r = btn.getBoundingClientRect();
        const after = ev.clientY - r.top > r.height / 2;
        btn.classList.toggle("tw--under", after);
        btn.classList.toggle("tw--over", !after);
      };
      btn.ondragleave = () => btn.classList.remove("tw--over", "tw--under");
      btn.ondrop = ev => {
        ev.preventDefault();
        const dragId = ev.dataTransfer.getData("text/plain");
        const r = btn.getBoundingClientRect();
        const after = ev.clientY - r.top > r.height / 2;
        btn.classList.remove("tw--over", "tw--under");
        reorderBranch(dragId, id, after);
      };
    }
    /* Up and down step through the list. The board also uses the arrow keys
       to scroll, so this only applies while a row has focus. */
    btn.onkeydown = edge => {
      if (edge.key !== "ArrowUp" && edge.key !== "ArrowDown") return;
      edge.preventDefault();
      edge.stopPropagation();
      const rows = [...box.querySelectorAll(".tw")];
      const at = rows.indexOf(btn);
      const next = rows[at + (edge.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      const to = next.dataset.branch;
      switchBranch(to === "" ? null : to);
      const again = [...trialEls.tree.querySelectorAll(".tw")].find(
        r => r.dataset.branch === (to === "" ? "" : to),
      );
      if (again) again.focus();
    };
    box.appendChild(btn);
  };
  /* A branch that overwrites something already decided above it is standing on
     a contradiction with its own parent, which is easy to do by accident and
     hard to spot. */
  const clashes = node => {
    const base = baseBoardOf(node),
      mark = node.marks || {};
    let count = 0;
    for (const i in mark.e || {}) if (base.edges[+i] !== "0" && base.edges[+i] !== mark.e[i]) count++;
    for (const i in mark.k || {}) if (base.cells[+i] !== "0" && base.cells[+i] !== mark.k[i]) count++;
    return count;
  };

  /* If what this branch assumed has since been settled the same way further
     up, it is no longer a guess and can be taken as read. */
  const premiseSettled = node => {
    const player = node.premise;
    if (!player || player.to === "0") return false;
    const base = baseBoardOf(node);
    if (player.kind === "edge") return base.edges[player.idx] === player.to;
    if (player.kind === "cell") return base.cells[player.idx] === player.to;
    return false;
  };

  const flagFor = node => {
    // a parked branch is judged from the board its marks derive to
    const st = trial && trial.id === node.id ? null : deriveBoard(node);
    const twist = findTrouble(st);
    if (twist.msgs.length) return { text: "BROKEN", kind: "bad" };
    const c = clashes(node);
    if (c) return { text: "OVERWRITES " + c, kind: "clash" };
    if (premiseSettled(node)) return { text: "ALREADY TRUE", kind: "good" };
    if (twist.solved) return { text: "CLOSES", kind: "good" };
    return null;
  };
  row("Master", 0, null, null, "the shared puzzle everyone works on");
  const walk = (ids, depth) =>
    ids.forEach(id => {
      const node = branches.get(id);
      if (!node) return;
      const kids = node.children.filter(cell => branches.get(cell));
      const shut = kids.length && !openBranches.has(id) && !onPathToTrial(id);
      row(branchLabel(node), depth, id, flagFor(node), premiseLabel(node.premise),
          kids.length ? { count: kids.length, shut } : null);
      if (!shut) walk(node.children, depth + 1);
    });
  walk(trunk.children, 1);
}

function renderTrial() {
  // undoing the premise leaves the branch assuming nothing; the next mark sets a new one
  if (trial && trial.premise && !premiseHolds(trial)) trial.premise = null;
  const on = !!trial;
  trialEls.reject.hidden = !on;
  trialEls.accept.hidden = !on;
  trialEls.rename.hidden = !on;
  trialEls.drop.hidden = !on;
  trialEls.start.disabled = !room || !!(room && room.solvedAt);
  trialEls.start.textContent = on ? "Branch from here" : "Start a branch";
  trialEls.block.classList.toggle("on", on);
  renderTree();
  paintPremises();

  if (!on) {
    trialEls.tag.textContent = "";
    trialEls.tag.className = "";
    trialEls.copy.textContent = branches.size
      ? "Pick a branch to work on it, or start another from the puzzle."
      : "Branch off to test a guess. Branches are yours alone — the only way one reaches the puzzle is by being disproved.";
    return;
  }
  const twist = findTrouble();
  const holds = premiseHolds(trial);
  trialEls.reject.disabled = !holds;
  if (twist.msgs.length) {
    trialEls.tag.textContent = "CONTRADICTION";
    trialEls.tag.className = "bad";
    trialEls.copy.textContent =
      twist.msgs[0][0].toUpperCase() +
      twist.msgs[0].slice(1) +
      (holds ? " — so the premise is wrong. Rule it out." : ".");
  } else if (twist.solved) {
    trialEls.tag.textContent = "CLOSES THE LOOP";
    trialEls.tag.className = "good";
    trialEls.copy.textContent =
      "This branch finishes the puzzle, so its premise was right. Nothing to rule out.";
  } else {
    trialEls.tag.textContent = "NOTHING BROKEN YET";
    trialEls.tag.className = "good";
    // the premise is already on the row above and circled on the board; saying
    // it a third time only pushed the buttons down the panel
    trialEls.copy.textContent = trial.premise
      ? ""
      : "Your first mark becomes this branch's premise.";
  }
}

trialEls.start.onclick = createBranch;
trialEls.accept.onclick = acceptBranch;
trialEls.rename.onclick = () => renameBranch(trial);
trialEls.reject.onclick = () => rejectBranch(true);
trialEls.drop.onclick = () => rejectBranch(false);

/* Replacing the puzzle throws away everyone's work, so it belongs to whoever
   opened the sheet. Rooms made before this existed have no owner recorded and
   stay open to all. */
function isOwner() {
  return !room || !room.owner || (me && room.owner === me.id);
}
function ownerLabel() {
  return room && room.ownerName ? room.ownerName : "whoever opened this puzzle";
}
function applyOwnerRules() {
  const btn = document.getElementById("newsheet");
  if (!btn) return;
  const mine = isOwner();
  btn.disabled = !mine;
  btn.textContent = mine
    ? "Load a new puzzle"
    : "Only " + ownerLabel() + " can change the puzzle";
  btn.title = mine ? "" : "Leave to start one of your own.";
}
