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
    twin: node.twin || null,
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
      twin: r.twin || null,
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
    // every edge mark has an author, not only the drawn ones: an x kept losing
    // its owner here and came back black
    for (const i in (n.marks || {}).e || {})
      if (n.marks.e[i] !== "0")
        eo[+i] = owners[i] !== undefined ? owners[i] : fallback;
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

/* Names the dot itself, so a message can point at where the trouble is
   rather than only saying that there is some. */
function nearName(dot) {
  const across = engine.C + 1;
  const row = (dot / across) | 0,
    col = dot % across;
  return "r" + (row + 1) + "c" + (col + 1);
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
      cellsAtVert(value, bad);
      msgs.push("three lines meet at one dot, by " + nearName(value));
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
      msgs.push("the " + want + " at " + cellName(cell) + " has too many lines");
    } else if (on + free < want) {
      bad.add(cell);
      msgs.push("the " + want + " at " + cellName(cell) + " can no longer reach its number");
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
          // say which squares, so the message points somewhere
          const at =
            first < CELL_COUNT && btn < CELL_COUNT
              ? " at " + cellName(first) + " and " + cellName(btn)
              : " at " + cellName(first < CELL_COUNT ? first : btn);
          msgs.push(why + at);
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

/* What the branch above has already settled. A branch may only mark things
   left open there: it adds to its parent, it does not argue with it. Trying
   to rub out or change something the parent decided is refused, so a branch
   can never quietly contradict what it is built on. */
function settledAbove(kind, idx) {
  if (!trial) return null;
  const base = trial.baseBoard || baseBoardOf(trial);
  if (!base) return null;
  const at =
    kind === "edge" ? base.edges[idx] : kind === "cell" ? base.cells[idx] : "0";
  return at && at !== "0" ? at : null;
}

/* How many marks a branch has made, so an assumption can be taken back only
   while nothing has been built on it. */
function markCount(node) {
  if (!node || !node.marks) return 0;
  let n = 0;
  for (const kind of ["e", "k", "d", "r"]) n += Object.keys(node.marks[kind] || {}).length;
  return n;
}

/* Whether this mark would undo the branch's own assumption. Taking it back is
   fine while the branch is still just that assumption; once other marks rest
   on it, undoing it quietly changes what everything else was based on. */
function undoesPremise(kind, idx, to) {
  if (!trial || !trial.premise) return false;
  const p = trial.premise;
  if (p.kind !== kind || p.idx !== idx) return false;
  if (to === p.to) return false;
  // everything except the assumption itself: those are what would be left
  // standing on something no longer being assumed
  const own = MARK_KEY[p.kind];
  let others = 0;
  for (const kindKey of ["e", "k", "d", "r"])
    for (const at in (trial.marks || {})[kindKey] || {})
      if (!(kindKey === own && +at === p.idx)) others++;
  return others > 0;
}

/* A branch's premise is the thing it is assuming. Rubbing something out
   assumes nothing — there is no claim in "this is no longer a line" — so a
   clearing is never taken as the premise, and the branch waits for a real
   one. */
/* A guess and its opposite are one piece of reasoning, so making one makes
   both. The twin is created the moment the first mark decides what this
   branch is assuming, and from then on the two are settled together. */
function notePremise(kind, idx, from, to) {
  if (!trial || trial.premise || from === to) return;
  if (to === "0") return;
  trial.premise = { kind, idx, from, to };
  /* Built after this mark has finished being written. Making it here, in the
     middle of the write, left the branch's own premise cleared. */
  const mine = trial;
  setTimeout(() => {
    if (branches.get(mine.id)) {
      pushTree(mine);
      makeTwin(mine);
    }
  }, 0);
}

/* Whether this square is already spoken for by a branch under the same
   parent — either way round. Two branches guessing at the same square would
   be two names for the same fork. */
function premiseTaken(parentId, kind, idx, ignoreId) {
  const siblings = (parentId ? branches.get(parentId)?.children : trunk.children) || [];
  for (const id of siblings) {
    if (id === ignoreId) continue;
    const node = branches.get(id);
    const p = node && node.premise;
    if (p && p.kind === kind && p.idx === idx) return node;
  }
  return null;
}

function makeTwin(node) {
  if (!node || !node.premise || node.twin) return null;
  const p = node.premise;
  const other = negate(p);
  if (other === "0" || other === p.to) return null;

  const twin = {
    id: newBranchId(),
    parent: node.parent || null,
    children: [],
    premise: { kind: p.kind, idx: p.idx, from: p.from, to: other },
    marks: { e: {}, k: {}, d: {} },
    mt: {},
    mo: {},
    by: me ? me.name : "?",
    byId: me ? me.id : null,
    at: now(),
    made: now(),
    twin: node.id,
    undo: [],
    redo: [],
  };
  // the twin's own assumption, recorded the same way any mark would be
  const key = MARK_KEY[p.kind];
  twin.marks[key][p.idx] = other;
  twin.mt[key] = { [p.idx]: now() };
  twin.mo[key] = { [p.idx]: penSlot(me.id) };

  node.twin = twin.id;
  branches.set(twin.id, twin);
  (node.parent ? branches.get(node.parent) : trunk).children.push(twin.id);
  pushTree(twin);
  pushTree(node);
  renderTrial();
  return twin;
}

/* Both halves of a fork go together. */
function twinOf(node) {
  return node && node.twin ? branches.get(node.twin) || null : null;
}

function switchBranch(id) {
  if (!room) return;
  // looking at a branch means looking at what is under it
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
  if (!room) return;      // branching still makes sense after a solve
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

/* Settling one half of a fork settles the other: the pair is one question,
   and leaving half of it behind would leave a guess nobody is testing. */
function dropWithTwin(node) {
  const other = twinOf(node);
  dropSubtree(node);
  if (other && branches.get(other.id)) {
    other.twin = null;
    dropSubtree(other);
  }
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
/* Settling a branch usually means trying the next idea straight away, so this
   offers to open one on the same parent. Off by default: it changes where you
   end up after pressing a button, which should be a choice. */
let chainBranches = false;

function afterSettling(parentId) {
  if (!chainBranches || !room || room.solvedAt) return;
  switchBranch(parentId || null);
  createBranch();
}

/* The other half of a fork. Twins know each other directly now; the premise
   check is kept for branches made before that was so. */
function inverseOf(node) {
  if (!node || !node.premise || node.premise.to === "0") return null;
  const twin = twinOf(node);
  if (twin) return twin;
  const mine = node.premise;
  const siblings = (node.parent ? branches.get(node.parent)?.children : trunk.children) || [];
  for (const id of siblings) {
    const other = branches.get(id);
    const theirs = other && other.premise;
    if (!theirs || other.id === node.id) continue;
    if (theirs.kind !== mine.kind || theirs.idx !== mine.idx) continue;
    if (theirs.to === "0" || theirs.to === mine.to) continue;
    return other;
  }
  return null;
}

/* What both halves have decided the same way. Between them they cover every
   case, so anything they agree on holds whichever way the guess goes. */
function agreedBetween(a, b) {
  const out = [];
  const boardA = deriveBoard(a),
    boardB = deriveBoard(b);
  const base = baseBoardOf(a);
  const look = (kind, field) => {
    const seen = new Set([
      ...Object.keys((a.marks || {})[MARK_KEY[kind]] || {}),
      ...Object.keys((b.marks || {})[MARK_KEY[kind]] || {}),
    ]);
    for (const at of seen) {
      const idx = +at;
      if (a.premise && kind === a.premise.kind && idx === a.premise.idx) continue;
      const value = boardA[field][idx];
      if (value === "0" || value !== boardB[field][idx]) continue;
      if (base[field][idx] === value) continue;
      out.push({ kind, idx, value });
    }
  };
  look("edge", "edges");
  look("cell", "cells");
  return out;
}

function promoteAgreed() {
  if (!trial) return;
  const other = inverseOf(trial);
  if (!other) {
    toast("This needs a pair of branches assuming opposite things");
    return;
  }
  const agreed = agreedBetween(trial, other);
  if (!agreed.length) {
    toast("The two branches have not agreed on anything yet");
    return;
  }
  const parentId = trial.parent || null;
  switchBranch(parentId);
  let put = 0;
  for (const mark of agreed) {
    if (mark.kind === "edge") {
      if (setEdgeUser(mark.idx, mark.value, false)) put++;
    } else if (setCellUser(mark.idx, mark.value, false)) put++;
  }
  render();
  flush();
  toast(
    put
      ? `${put} mark${put === 1 ? "" : "s"} hold either way — put on ${parentId ? "the branch above" : "the puzzle"}`
      : "Nothing new to put across",
  );
}

/* One branch may take a copy of another's work when it has already settled
   the very thing that branch was guessing at. The branch it came from stays:
   A implying B, and B implying C, does not make C false when A is. */
function adoptable() {
  if (!trial) return [];
  const board = deriveBoard(trial);
  const out = [];
  for (const node of branches.values()) {
    if (node.id === trial.id || node.id === trial.twin) continue;
    if (isAncestor(node.id, trial) || isAncestor(trial.id, node)) continue;
    const p = node.premise;
    if (!p || p.to === "0") continue;
    const here =
      p.kind === "edge" ? board.edges[p.idx] : p.kind === "cell" ? board.cells[p.idx] : null;
    if (here === p.to) out.push(node);
  }
  return out;
}

function isAncestor(id, of) {
  for (let node = of; node; node = node.parent ? branches.get(node.parent) : null)
    if (node.parent === id) return true;
  return false;
}

function adoptBranch() {
  const ready = adoptable();
  if (!ready.length) {
    toast("Nothing to adopt: no other branch is assuming something you have settled");
    return;
  }
  const from = ready[0];
  const board = deriveBoard(trial);
  const marks = from.marks || {};
  let taken = 0;
  for (const [kind, key] of [
    ["edge", "e"],
    ["cell", "k"],
    ["diag", "d"],
  ]) {
    for (const at in marks[key] || {}) {
      const idx = +at;
      const value = marks[key][at];
      const here =
        kind === "edge" ? board.edges[idx] : kind === "cell" ? board.cells[idx] : board.diag[idx];
      if (here === value) continue;
      if (kind === "edge" && setEdgeUser(idx, value, false)) taken++;
      else if (kind === "cell" && setCellUser(idx, value, false)) taken++;
      else if (kind === "diag" && setDiagUser(idx, value, false)) taken++;
    }
  }
  render();
  flush();
  toast(
    taken
      ? `Took ${taken} mark${taken === 1 ? "" : "s"} from ${branchLabel(from)}`
      : `Nothing new to take from ${branchLabel(from)}`,
  );
}

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
  dropWithTwin(node);
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
  afterSettling(parentId);
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
  dropWithTwin(node);
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
  afterSettling(parentId);
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

/* What the list shows, without anything to fold or unfold: the offshoots of
   the branch you are on, and the offshoots of everything between it and the
   master. Other branches are listed, but what hangs beneath them is not —
   select one and its own offshoots appear. */
function openPath() {
  const path = new Set([null]);          // the master always shows its branches
  for (let node = trial; node; node = node.parent ? branches.get(node.parent) : null)
    path.add(node.id);
  return path;
}

function renderTree() {
  const box = trialEls.tree;
  box.innerHTML = "";
  const row = (label, depth, id, flag, premise) => {
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
    btn.title = "";      // the row already says what it is
    if (flag && flag.why) {
      const why = document.createElement("span");
      why.className = "tw__why";
      why.textContent = flag.why;
      btn.appendChild(why);
      btn.classList.add("tw--twoline");
    }
    if (flag && flag.kind === "clash") btn.classList.add("tw--clash");
    btn.onclick = () => switchBranch(id);
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
    // the reason travels with the flag, so a branch can say what is wrong
    // without having to be selected first
    if (twist.msgs.length) return { text: "BROKEN", kind: "bad", why: twist.msgs[0] };
    /* A branch can no longer contradict what is above it, so this only turns
       up on branches made before that rule, or when the master decided
       something after a branch had already marked it. */
    const c = clashes(node);
    if (c) return { text: "DISAGREES WITH ABOVE", kind: "clash" };
    if (premiseSettled(node)) return { text: "ALREADY TRUE", kind: "good" };
    if (twist.solved) return { text: "CLOSES", kind: "good" };
    return null;
  };
  row("Master", 0, null, null, "the shared puzzle everyone works on");
  const walk = (ids, depth) =>
    ids.forEach(id => {
      const node = branches.get(id);
      if (!node) return;
      row(branchLabel(node), depth, id, flagFor(node), premiseLabel(node.premise));
      if (path.has(id)) walk(node.children, depth + 1);
    });
  const path = openPath();
  walk(trunk.children, 1);
}

function renderTrial() {
  // undoing the premise leaves the branch assuming nothing; the next mark sets a new one
  if (trial && trial.premise && !premiseHolds(trial)) trial.premise = null;
  const on = !!trial;
  // the whole group appears together, rather than four buttons arriving one
  // by one in the middle of the panel
  const settle = document.getElementById("trialSettle");
  if (settle) settle.hidden = !on;
  const agreed = document.getElementById("trialAgreed");
  if (agreed) {
    const other = on ? inverseOf(trial) : null;
    const both = other ? agreedBetween(trial, other) : [];
    agreed.hidden = !both.length;
    if (both.length)
      agreed.textContent =
        "Keep the " + both.length + " mark" + (both.length === 1 ? "" : "s") + " that hold either way";
  }
  const adopt = document.getElementById("trialAdopt");
  if (adopt) {
    const ready = on ? adoptable() : [];
    adopt.hidden = !ready.length;
    if (ready.length) adopt.textContent = "Adopt " + branchLabel(ready[0]);
  }
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
document.getElementById("trialAdopt").onclick = adoptBranch;
document.getElementById("trialAgreed").onclick = promoteAgreed;
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
/* What only the person who opened the puzzle may do. Wiping everyone's lines,
   xs or colours is as destructive as replacing the puzzle, so those go the
   same way. A guest sees none of them rather than a row of dead buttons. */
var OWNER_ONLY = ["newsheet", "clearlines", "clearx", "clearfill"];

function applyOwnerRules() {
  const mine = isOwner();
  for (const id of OWNER_ONLY || []) {
    const btn = document.getElementById(id);
    if (btn) btn.hidden = !mine;
  }
  const guest = document.getElementById("guestNote");
  if (guest) {
    guest.hidden = mine;
    guest.textContent = mine ? "" : "Only " + ownerLabel() + " can change or clear this puzzle.";
  }
  const btn = document.getElementById("newsheet");
  if (btn && mine) {
    btn.disabled = false;
    btn.textContent = "Load a new puzzle";
    btn.title = "";
  }
}
