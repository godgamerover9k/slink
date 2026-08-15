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
  test: document.getElementById("trialTest"),
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
let trunk = { children: [], saved: null, undo: [], redo: [] }; // the shared sheet itself
let showPremises = true;
/* `trial` (declared with the room state) holds the active node, or null on the sheet.
   Everything that pauses syncing keys off it, so the sheet only moves when null. */

const FLIP = { 1: "2", 2: "1" };
const negate = p => (p.to === "0" ? p.from : FLIP[p.to]);

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
function loadSnapshot(s) {
  room.edges = s.edges;
  room.cells = s.cells;
  room.eo = s.eo.slice();
  if (typeof s.diag === "string") room.diag = s.diag;
  if (s.rels) room.rels = Object.assign({}, s.rels);
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
    made: node.made || node.at,
    ord: node.ord,
    name: node.name || "",
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
      made: r.made || r.at,
      name: r.name || "",
      undo: [],
      redo: [],
      doneShown: false,
    });
  }
  for (const n of branches.values()) {
    const par = n.parent ? branches.get(n.parent) : null;
    if (n.parent && !par) {
      branches.delete(n.id);
      continue;
    } // orphan
    (par ? par.children : trunk.children).push(n.id);
  }
  const key = id => {
    const n = branches.get(id);
    if (n.ord !== undefined && n.ord !== null) return n.ord;
    return n.made || n.at || 0;        // when it was made, not when last touched
  };
  const sortAt = ids => ids.sort((a, b) => key(a) - key(b));
  sortAt(trunk.children);
  for (const n of branches.values()) sortAt(n.children);
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
    const m = n.marks || {};
    for (const i in m.e || {}) edges = put(edges, +i, m.e[i]);
    for (const i in m.k || {}) cells = put(cells, +i, m.k[i]);
    for (const i in m.d || {}) diag = put(diag, +i, m.d[i]);
    for (const key in m.r || {}) {
      if (m.r[key] === "0") delete rels[key];
      else rels[key] = m.r[key];
    }
  }
  const eo = base.eo ? base.eo.slice() : room.eo.slice();
  for (const n of chainOf(node)) {
    const own = n.byId ? penSlot(n.byId) : -1;
    for (const i in (n.marks || {}).e || {}) if (n.marks.e[i] === "1") eo[+i] = own;
  }
  return { edges, cells, diag, rels, eo };
}
function recordMark(node, kind, idx, val) {
  const key = MARK_KEY[kind];
  if (!node.marks) node.marks = { e: {}, k: {}, d: {} };
  if (!node.marks[key]) node.marks[key] = {};
  node.marks[key][idx] = val;
  pushTree(node);
}

/* Branches derive from their parent, so a mark added above is inherited
   below automatically; nothing needs pushing down. */
function propagateDown() {
  /* children derive from their parent; nothing to push */
}
const slotOf = n => n || trunk;
const parentOf = n => (n && n.parent != null ? branches.get(n.parent) : null);

function cellName(k) {
  return "r" + (((k / engine.C) | 0) + 1) + "c" + ((k % engine.C) + 1);
}

function cellsAtVert(v, into) {
  const C = engine.C,
    r = (v / (C + 1)) | 0,
    c = v % (C + 1);
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
  for (let v = 0; v < DOT_COUNT; v++)
    if (deg[v] > 2) {
      msgs.push("three lines meet at one dot");
      cellsAtVert(v, bad);
    }
  for (let k = 0; k < CELL_COUNT; k++) {
    const want = room.clues[k];
    if (want < 0) continue;
    let on = 0,
      free = 0;
    for (let j = 0; j < 4; j++) {
      const c = edges[engine.cEdge[k * 4 + j]];
      if (c === "1") on++;
      else if (c === "0") free++;
    }
    if (on > want) {
      bad.add(k);
      msgs.push("a clue has more lines than its number");
    } else if (on + free < want) {
      bad.add(k);
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
      let p = 0,
        r = x;
      while (parent[r] !== r) {
        p ^= par[r];
        r = parent[r];
      }
      let cur = x,
        cp = p;
      while (parent[cur] !== cur) {
        // path compression, parity kept
        const nx = parent[cur],
          np = cp ^ par[cur];
        parent[cur] = r;
        par[cur] = cp;
        cur = nx;
        cp = np;
      }
      return [r, p];
    };
    const join = (a, b, diff, why) => {
      const [ra, pa] = find(a),
        [rb, pb] = find(b);
      if (ra === rb) {
        if (((pa ^ pb) & 1) !== (diff & 1)) {
          bad.add(a < CELL_COUNT ? a : b);
          if (b < CELL_COUNT) bad.add(b);
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

    for (let k = 0; k < CELL_COUNT; k++) {
      const r = (k / C) | 0,
        c = k % C;
      if (c + 1 < C) {
        const e = engine.V(r, c + 1);
        if (edges[e] === "1") join(k, k + 1, 1, "a line has the same colour on both sides");
        else if (edges[e] === "2")
          join(k, k + 1, 0, "two colours meet with no line between them");
      }
      if (r + 1 < engine.R) {
        const e = engine.H(r + 1, c);
        if (edges[e] === "1") join(k, k + C, 1, "a line has the same colour on both sides");
        else if (edges[e] === "2")
          join(k, k + C, 0, "two colours meet with no line between them");
      }
      const col = cells ? cells[k] : "0";
      if (col === "1") join(k, OUT, 0, "a colour disagrees with the lines around it");
      else if (col === "2") join(k, OUT, 1, "a colour disagrees with the lines around it");
    }
    const rels = (st || room).rels || {};
    for (const key in rels) {
      const [a, b] = key.split(":").map(Number);
      if (!(a >= 0 && b >= 0 && a < CELL_COUNT && b < CELL_COUNT)) continue;
      join(
        a,
        b,
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
    for (let v = 0; v < DOT_COUNT; v++)
      if (deg[v] !== 0 && deg[v] !== 2) {
        closed = false;
        break;
      }
    if (closed) msgs.push("the loop closes early, leaving the puzzle unfinished");
  }
  return { bad, msgs: [...new Set(msgs)], solved: info.solved };
}

function branchLabel(n) {
  if (!n) return "Master";
  return n.name ? n.name : premiseLabel(n.premise);
}

function renameBranch(n) {
  if (!n) return;
  const given = prompt(
    "Name this branch\n\nLeave it empty to go back to showing its premise.",
    n.name || "",
  );
  if (given === null) return;
  n.name = given.trim().slice(0, 40);
  pushTree(n);
  render();
}

function premiseLabel(p) {
  if (!p) return "nothing assumed yet";
  const word =
    p.kind === "cell"
      ? { 1: "blue", 2: "yellow", 0: "cleared" }[p.to]
      : { 1: "line", 2: "×", 0: "cleared" }[p.to];
  if (p.kind === "cell") return cellName(p.idx) + " → " + word;
  const i = p.idx,
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
function premiseHolds(n) {
  if (!n || !n.premise) return false;
  const p = n.premise;
  return (p.kind === "cell" ? room.cells[p.idx] : room.edges[p.idx]) === p.to;
}

function notePremise(kind, idx, from, to) {
  if (trial && !trial.premise && from !== to) trial.premise = { kind, idx, from, to };
}

function switchBranch(id) {
  if (!room) return;
  const target = id == null ? null : branches.get(id);
  if (id != null && !target) return;
  if (!trial) trunk.saved = boardSnapshot(); // remember the sheet as it stands
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

function dropSubtree(n) {
  n.children.slice().forEach(id => {
    const c = branches.get(id);
    if (c) dropSubtree(c);
  });
  const holder = parentOf(n) || trunk;
  const at = holder.children.indexOf(n.id);
  if (at >= 0) holder.children.splice(at, 1);
  branches.delete(n.id);
  // a tombstone, so the deletion reaches everyone else too
  ensureTree(room);
  room.tree[n.id] = {
    id: n.id,
    parent: n.parent,
    premise: n.premise,
    marks: null,
    by: n.by,
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
  const p = node.premise,
    parentId = node.parent;
  const sound = deduce && !!p && premiseHolds(node);
  const kids = node.children.length;
  dropSubtree(node);
  switchBranch(parentId);
  if (sound) {
    const neg = negate(p);
    if (p.kind === "edge") setEdgeUser(p.idx, neg, false);
    else setCellUser(p.idx, neg, false);
    const where = parentId ? "on the branch above" : "on the puzzle";
    toast(premiseLabel(p) + " ruled out — opposite written " + where);
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
  for (let n = trial; n; n = parentOf(n))
    if (n.premise) chain.push({ p: n.premise, cur: n === trial });
  chain.forEach(({ p, cur }) => {
    const el = document.createElementNS(NS, "rect");
    if (p.kind === "cell") {
      const r = (p.idx / engine.C) | 0,
        c = p.idx % engine.C;
      el.setAttribute("x", PAD + c * CELL + 4);
      el.setAttribute("y", PAD + r * CELL + 4);
      el.setAttribute("width", CELL - 8);
      el.setAttribute("height", CELL - 8);
      el.setAttribute("rx", 3);
    } else {
      const q = edgeGeom(p.idx),
        horiz = q.y1 === q.y2,
        pad = 5,
        th = 6.5;
      const x = Math.min(q.x1, q.x2),
        y = Math.min(q.y1, q.y2);
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
  const a = branches.get(dragId),
    b = branches.get(dropId);
  if (!a || !b || a.id === b.id) return false;
  if ((a.parent || null) !== (b.parent || null)) return false;
  const holder = (a.parent ? branches.get(a.parent) : trunk).children;
  const from = holder.indexOf(dragId);
  if (from < 0) return false;
  holder.splice(from, 1);
  let to = holder.indexOf(dropId);
  if (to < 0) return false;
  holder.splice(after ? to + 1 : to, 0, dragId);
  holder.forEach((id, i) => {
    const n = branches.get(id);
    if (n && n.ord !== i) {
      n.ord = i;
      pushTree(n);
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
  for (let n = trial; n; n = n.parent ? branches.get(n.parent) : null)
    if (n.parent === id) return true;
  return false;
}

function renderTree() {
  const box = trialEls.tree;
  box.innerHTML = "";
  const row = (label, depth, id, flag, premise, kids) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tw";
    b.style.paddingLeft = 6 + depth * 12 + "px";
    b.setAttribute("aria-current", id == null ? trial === null : trial && trial.id === id);
    b.innerHTML = `<span class="tw__rail"></span><span class="tw__label"></span><span class="tw__flag"></span>`;
    b.querySelector(".tw__rail").textContent = depth ? "└" : "●";
    b.querySelector(".tw__label").textContent = label;
    const f = b.querySelector(".tw__flag");
    if (flag) {
      f.textContent = flag.text;
      f.className = "tw__flag " + flag.kind;
    }
    /* Offshoots stay tucked away until you ask for them, with a count so you
       can see there is something under there. */
    if (kids) {
      const t = document.createElement("span");
      t.className = "tw__twist";
      t.textContent = (kids.shut ? "▸ " : "▾ ") + kids.count;
      t.title = kids.shut ? `show ${kids.count} inside` : "hide what is inside";
      t.onclick = ev => {
        ev.stopPropagation();
        if (openBranches.has(id)) openBranches.delete(id);
        else openBranches.add(id);
        renderTrial();
      };
      b.appendChild(t);
    }
    b.title = premise || label;
    if (flag && flag.kind === "clash") b.classList.add("tw--clash");
    b.onclick = () => switchBranch(id);
    if (id != null)
      b.ondblclick = ev => {
        ev.preventDefault();
        renameBranch(branches.get(id));
      };
    b.dataset.branch = id == null ? "" : id;
    if (id != null) {
      b.draggable = true;
      b.ondragstart = ev => {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", id);
        b.classList.add("tw--dragging");
      };
      b.ondragend = () => {
        b.classList.remove("tw--dragging");
        box.querySelectorAll(".tw").forEach(r => r.classList.remove("tw--over", "tw--under"));
      };
      b.ondragover = ev => {
        const from = box.querySelector(".tw--dragging");
        if (!from || from === b) return;
        const same =
          (branches.get(from.dataset.branch) || {}).parent === (branches.get(id) || {}).parent;
        if (!same) return; // only within the same parent
        ev.preventDefault();
        const r = b.getBoundingClientRect();
        const after = ev.clientY - r.top > r.height / 2;
        b.classList.toggle("tw--under", after);
        b.classList.toggle("tw--over", !after);
      };
      b.ondragleave = () => b.classList.remove("tw--over", "tw--under");
      b.ondrop = ev => {
        ev.preventDefault();
        const dragId = ev.dataTransfer.getData("text/plain");
        const r = b.getBoundingClientRect();
        const after = ev.clientY - r.top > r.height / 2;
        b.classList.remove("tw--over", "tw--under");
        reorderBranch(dragId, id, after);
      };
    }
    /* Up and down step through the list. The board also uses the arrow keys
       to scroll, so this only applies while a row has focus. */
    b.onkeydown = e => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      e.stopPropagation();
      const rows = [...box.querySelectorAll(".tw")];
      const at = rows.indexOf(b);
      const next = rows[at + (e.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      const to = next.dataset.branch;
      switchBranch(to === "" ? null : to);
      const again = [...trialEls.tree.querySelectorAll(".tw")].find(
        r => r.dataset.branch === (to === "" ? "" : to),
      );
      if (again) again.focus();
    };
    box.appendChild(b);
  };
  /* A branch that overwrites something already decided above it is standing on
     a contradiction with its own parent, which is easy to do by accident and
     hard to spot. */
  const clashes = n => {
    const base = baseBoardOf(n),
      m = n.marks || {};
    let count = 0;
    for (const i in m.e || {}) if (base.edges[+i] !== "0" && base.edges[+i] !== m.e[i]) count++;
    for (const i in m.k || {}) if (base.cells[+i] !== "0" && base.cells[+i] !== m.k[i]) count++;
    return count;
  };

  /* If what this branch assumed has since been settled the same way further
     up, it is no longer a guess and can be taken as read. */
  const premiseSettled = n => {
    const p = n.premise;
    if (!p || p.to === "0") return false;
    const base = baseBoardOf(n);
    if (p.kind === "edge") return base.edges[p.idx] === p.to;
    if (p.kind === "cell") return base.cells[p.idx] === p.to;
    return false;
  };

  const flagFor = n => {
    // a parked branch is judged from the board its marks derive to
    const st = trial && trial.id === n.id ? null : deriveBoard(n);
    const t = findTrouble(st);
    if (t.msgs.length) return { text: "BROKEN", kind: "bad" };
    const c = clashes(n);
    if (c) return { text: "OVERWRITES " + c, kind: "clash" };
    if (premiseSettled(n)) return { text: "ALREADY TRUE", kind: "good" };
    if (t.solved) return { text: "CLOSES", kind: "good" };
    return null;
  };
  row("Master", 0, null, null, "the shared puzzle everyone works on");
  const walk = (ids, depth) =>
    ids.forEach(id => {
      const n = branches.get(id);
      if (!n) return;
      const kids = n.children.filter(k => branches.get(k));
      const shut = kids.length && !openBranches.has(id) && !onPathToTrial(id);
      row(branchLabel(n), depth, id, flagFor(n), premiseLabel(n.premise),
          kids.length ? { count: kids.length, shut } : null);
      if (!shut) walk(n.children, depth + 1);
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
  const t = findTrouble();
  const holds = premiseHolds(trial);
  trialEls.reject.disabled = !holds;
  if (t.msgs.length) {
    trialEls.tag.textContent = "CONTRADICTION";
    trialEls.tag.className = "bad";
    trialEls.copy.textContent =
      t.msgs[0][0].toUpperCase() +
      t.msgs[0].slice(1) +
      (holds ? " — so the premise is wrong. Rule it out." : ".");
  } else if (t.solved) {
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

trialEls.test.onclick = () => {
  if (!room) return;
  const btn = trialEls.test,
    label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Working…";
  setTimeout(() => {
    const quick = findTrouble();
    if (quick.msgs.length) {
      toast(quick.msgs[0][0].toUpperCase() + quick.msgs[0].slice(1));
      btn.disabled = false;
      btn.textContent = label;
      return;
    }
    const S2 = Solver(engine),
      preset = new Uint8Array(engine.E);
    for (let i = 0; i < engine.E; i++)
      preset[i] = room.edges[i] === "1" ? ON : room.edges[i] === "2" ? OFF : UNK;
    const res = S2.solve(Int8Array.from(room.clues), 1, 600000, preset);
    if (res.count > 0) toast("No contradiction — these marks still fit a real solution");
    else if (res.aborted) toast("Couldn't settle this one either way");
    else
      toast(
        trial
          ? "Dead end — the premise can be ruled out"
          : "Dead end — no solution fits these marks",
      );
    btn.disabled = false;
    btn.textContent = label;
  }, 20);
};

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
