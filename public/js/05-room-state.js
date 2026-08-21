import { Engine } from "./01-engine.js";
import { buildBoard, penSlot, render } from "./06-board.js";
import { redoStack, setRedoStack, setUndoStack, undoStack } from "./07-input.js";
import { boardSnapshot, branches, deriveBoard, ensureTree, flushSoon, loadSnapshot, mergeBranchRecord, notePremise, premiseTaken, recordMark, refreshBase, setBranches, settledAbove, syncTreeFromRoom, trunk, undoesPremise, unmakePremise } from "./08-branches.js";
import { toast } from "./09-tools.js";

/* ============================================================
   4. Shared puzzle state
   ============================================================ */
/* Graphite is last so it is never handed out automatically — nobody is given
   black by chance, but anyone can choose it. */
var PENS = ["--pen-1", "--pen-2", "--pen-3", "--pen-4", "--pen-5", "--pen-6", "--graphite"];
var AUTO_PENS = 6;
var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var ROOM_KEY = c => "sl:room:" + c;
var INDEX_KEY = "sl:index";
var ME_KEY = "sl:me";
var POLL_MS = 3000,
  FLUSH_MS = 380,
  HEARTBEAT_MS = 18000,
  IDLE_MS = 45000;

var store = {
  /* Three ways to keep a puzzle, tried in order:
       artifact - window.storage, which only exists in the Claude runtime
       http     - a slink-gen room server, when the page is served from one
       memory   - on your own, nothing shared                            */
  mode: "memory",
  mem: new Map(),
  /* A public room server asks for a key. It arrives in the link (?k=...) and
     is kept for the session so it isn't left sitting in the address bar. */
  /* The page can be hosted anywhere — Vercel, GitHub Pages, a file on disk —
     while the rooms live on a separate server. ?server=https://... points it
     there and is remembered, so the link only needs to be used once. */
  base: (() => {
    try {
      const url = new URL(location.href);
      let sv = url.searchParams.get("server");
      if (sv !== null) {
        url.searchParams.delete("server");
        history.replaceState(null, "", url.toString());
        try {
          sv
            ? window.localStorage.setItem("sl:server", sv)
            : window.localStorage.removeItem("sl:server");
        } catch (edge) {}
      } else {
        try {
          sv = window.localStorage.getItem("sl:server") || "";
        } catch (edge) {
          sv = "";
        }
      }
      return (sv || "").replace(/\/+$/, "");
    } catch (edge) {
      return "";
    }
  })(),
  key: (() => {
    try {
      const url = new URL(location.href);
      const cell = url.searchParams.get("k");
      if (cell !== null) {
        url.searchParams.delete("k");
        history.replaceState(null, "", url.toString());
        // remembered like the server address, so the full link is needed once
        try {
          cell
            ? window.localStorage.setItem("sl:key", cell)
            : window.localStorage.removeItem("sl:key");
        } catch (edge) {}
        return cell || "";
      }
      try {
        return window.localStorage.getItem("sl:key") || "";
      } catch (edge) {
        return "";
      }
    } catch (edge) {
      return "";
    }
  })(),
  kv(path) {
    return this.base + "/kv/" + path + (this.key ? "?k=" + encodeURIComponent(this.key) : "");
  },

  /* Private things — your name, the puzzle you were last on — belong to you,
     not to the room. Outside the artifact runtime they go in this browser's
     own storage; sending them to a shared server would have every player
     overwriting everyone else's. */
  localGet(cell) {
    try {
      const value = window.localStorage.getItem(cell);
      return value === null ? null : { key: cell, value: value };
    } catch (edge) {
      return this.mem.has(cell) ? { key: cell, value: this.mem.get(cell) } : null;
    }
  },
  localSet(cell, value) {
    try {
      window.localStorage.setItem(cell, value);
    } catch (edge) {}
    return { key: cell, value: value };
  },
  get ok() {
    return this.mode === "artifact" || this.mode === "http";
  },
  /* Chosen at the start: an offline puzzle is never written anywhere shared,
     even when a room server is sitting right there. */
  offline: false,

  get solo() {
    return !this.ok;
  },
  get shared() {
    return this.mode === "http" ? "server" : this.mode === "artifact" ? "artifact" : "none";
  },

  async probe() {
    if (this.offline) {
      this.mode = "memory";
      return false;
    }
    if (typeof window !== "undefined" && window.storage) {
      try {
        await window.storage.set("sl:probe", String(Date.now()), true);
        this.mode = "artifact";
        return true;
      } catch (edge) {
        /* fall through and try a server */
      }
    }
    if (this.base || (typeof location !== "undefined" && /^https?:$/.test(location.protocol))) {
      /* One missed answer should not decide this. A host that has been idle
         takes a moment to wake, and being told you are on your own when a
         server is right there is the worst way to get it wrong. */
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(this.base + "/kv/__health", { cache: "no-store" });
          if (r.ok) {
            this.mode = "http";
            this.needsKey = (await r.text()).includes("key") && !this.key;
            return true;
          }
        } catch (edge) {
          /* not answering yet */
        }
        if (attempt < 2) await new Promise(go => setTimeout(go, 400 * (attempt + 1)));
      }
    }
    this.mode = "memory";
    return false;
  },

  async get(cell, shared) {
    if (this.mode === "artifact") {
      try {
        return await window.storage.get(cell, shared);
      } catch (edge) {}
    } else if (shared === false) {
      return this.localGet(cell);
    } else if (this.mode === "http") {
      try {
        const r = await fetch(this.kv(encodeURIComponent(cell)), { cache: "no-store" });
        if (r.status === 404) return null;
        if (r.status === 401) {
          this.denied = true;
          return null;
        }
        if (r.ok) return { key: cell, value: await r.text() };
      } catch (edge) {}
    }
    return this.mem.has(cell) ? { key: cell, value: this.mem.get(cell) } : null;
  },

  async set(cell, value, shared) {
    this.mem.set(cell, value);
    if (this.mode === "artifact") {
      try {
        return await window.storage.set(cell, value, shared);
      } catch (edge) {
        this.mode = "memory";
      }
    } else if (shared === false) {
      return this.localSet(cell, value);
    } else if (this.mode === "http") {
      try {
        const r = await fetch(this.kv(encodeURIComponent(cell)), { method: "PUT", body: value });
        if (r.status === 401) this.denied = true;
      } catch (edge) {
        /* keep playing from memory; the next write may get through */
      }
    }
    return { key: cell, value: value };
  },
};

var me = null; // {id,name}
var room = null; // last merged shared state
var engine = null; // engine for the current puzzle
var pending = []; // ops not yet written
var recent = []; // ops kept briefly so a lost write can heal
var trial = null; // snapshot of the puzzle while a branch is being tried
var tOffset = 0; // clock alignment with other pens
var pollTimer = null,
  indexTimer = null,
  flushTimer = null,
  writing = false,
  lastWrite = 0;
var solvedShown = false;

/* strictly increasing: two marks inside the same millisecond would otherwise
   tie on the last-write-wins check and the second would be dropped */
var lastNow = 0;
var now = () => {
  const t = Math.max(Date.now() + tOffset, lastNow + 1);
  lastNow = t;
  return t;
};
var randCode = () =>
  Array.from({ length: 4 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join("");
var uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function blankRoom(code, puz) {
  const gg = Engine(puz.R, puz.C);
  return {
    v: 1,
    code,
    R: puz.R,
    C: puz.C,
    diff: puz.diff,
    gen: Date.now(),
    owner: me ? me.id : null,
    ownerName: me ? me.name : "",
    given: puz.given,
    minimal: !!puz.minimal,
    clues: puz.clues,
    edges: "0".repeat(gg.E),
    et: new Array(gg.E).fill(0),
    eo: new Array(gg.E).fill(-1),
    cells: "0".repeat(gg.NC),
    ct: new Array(gg.NC).fill(0),
    diag: "0".repeat(gg.NC),
    dt: new Array(gg.NC).fill(0),
    rt: {}, // "a:b" -> "s" same side | "d" opposite
    players: [],
    solvedAt: null,
    now: Date.now(),
  };
}

function playerIdx(r, id) {
  return r.players.findIndex(player => player.id === id);
}

function touchMe(r) {
  let i = playerIdx(r, me.id);
  if (i < 0) {
    r.players.push({ id: me.id, name: me.name, seen: now(), ops: 0 });
    i = r.players.length - 1;
  }
  r.players[i].name = me.name;
  r.players[i].seen = now();
  return i;
}

/* puzzles made before cell marks existed arrive without these fields */
function ensureCells(r) {
  const node = r.R * r.C;
  if (typeof r.cells !== "string" || r.cells.length !== node) r.cells = "0".repeat(node);
  if (!Array.isArray(r.ct) || r.ct.length !== node) r.ct = new Array(node).fill(0);
  if (typeof r.diag !== "string" || r.diag.length !== node) r.diag = "0".repeat(node);
  if (!Array.isArray(r.dt) || r.dt.length !== node) r.dt = new Array(node).fill(0);
  if (!r.rt || typeof r.rt !== "object") r.rt = {};
  return r;
}

function applyOp(r, op) {
  if (op.r !== undefined) {
    ensureCells(r);
    const cell = op.r;
    r.rt[cell] = op.t;
    return true;
  }
  if (op.d !== undefined) {
    // diagonal scribble, no gameplay effect
    ensureCells(r);
    const cell = op.d;
    if (op.t <= r.dt[cell]) return false;
    r.diag = r.diag.slice(0, cell) + op.val + r.diag.slice(cell + 1);
    r.dt[cell] = op.t;
    return true;
  }
  if (op.k !== undefined) {
    // cell mark
    ensureCells(r);
    const cell = op.k;
    if (op.t <= r.ct[cell]) return false;
    r.cells = r.cells.slice(0, cell) + op.val + r.cells.slice(cell + 1);
    r.ct[cell] = op.t;
    return true;
  }
  const i = op.e;
  if (op.t <= r.et[i]) return false;
  r.edges = r.edges.slice(0, i) + op.val + r.edges.slice(i + 1);
  r.et[i] = op.t;
  r.eo[i] = op.by;
  return true;
}

function mergePlayers(base, incoming) {
  for (const player of incoming) {
    const j = base.findIndex(other => other.id === player.id);
    if (j < 0) base.push({ ...player });
    else if (player.seen > base[j].seen) base[j] = { ...player };
  }
}

/* remote -> local merge, keeping anything of mine that is newer */
function adopt(remote) {
  if (remote.now) tOffset = Math.max(tOffset, remote.now - Date.now());
  if (!room || remote.gen > room.gen) {
    room = remote;
    engine = Engine(room.R, room.C);
    pending = [];
    recent = [];
    setUndoStack([]);
    setRedoStack([]);
    solvedShown = !!room.solvedAt;
    trial = null;
    document.body.classList.remove("trialing");
    trunk.saved = null;
    setBranches(new Map());
    trunk.children = [];
    buildBoard();
    syncTreeFromRoom();
    render();
    return;
  }
  // merges are against the master, so swap the branch view out for the moment
  const branchView = trial
    ? { edges: room.edges, cells: room.cells, diag: room.diag, eo: room.eo }
    : null;
  if (branchView && trunk.saved) loadSnapshot(trunk.saved);
  if (remote.gen < room.gen) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 60);
    return;
  }
  for (let i = 0; i < remote.et.length; i++) {
    if (remote.et[i] > room.et[i]) {
      room.edges = room.edges.slice(0, i) + remote.edges[i] + room.edges.slice(i + 1);
      room.et[i] = remote.et[i];
      room.eo[i] = remote.eo[i];
    }
  }
  ensureCells(room);
  ensureCells(remote);
  for (let cell = 0; cell < remote.ct.length; cell++) {
    if (remote.ct[cell] > room.ct[cell]) {
      room.cells = room.cells.slice(0, cell) + remote.cells[cell] + room.cells.slice(cell + 1);
      room.ct[cell] = remote.ct[cell];
    }
    if (remote.dt[cell] > room.dt[cell]) {
      room.diag = room.diag.slice(0, cell) + remote.diag[cell] + room.diag.slice(cell + 1);
      room.dt[cell] = remote.dt[cell];
    }
  }
  for (const key in remote.rt) {
    if ((remote.rt[key] || 0) > (room.rt[key] || 0)) {
      room.rt[key] = remote.rt[key];
    }
  }
  // the master is in room.* right now, so capture it before anything re-derives
  if (branchView) trunk.saved = boardSnapshot();
  // branches merge per id, newest record wins, tombstones included
  ensureTree(room);
  ensureTree(remote);
  let treeChanged = false;
  let treeNeedsResend = false;
  for (const id in remote.tree) {
    const rr = remote.tree[id],
      mine = room.tree[id];
    /* Mark by mark, not record by record: two people on one branch each write
       the whole thing, so replacing wholesale threw the other's work away. */
    const merged = mergeBranchRecord(mine, rr);
    if (JSON.stringify(merged) !== JSON.stringify(mine)) {
      room.tree[id] = merged;
      treeChanged = true;
    }
    /* Two people writing at once means one read the room before the other
       wrote, so a change can be overwritten wholesale. If what we hold is
       newer than what came back, send it again rather than let it be lost. */
    if (JSON.stringify(merged) !== JSON.stringify(rr)) treeNeedsResend = true;
  }
  if (treeNeedsResend) flushSoon();
  if (treeChanged) {
    const wasOn = trial ? trial.id : null;
    syncTreeFromRoom();
    // if the branch being worked on changed underneath, redraw from its marks
    if (wasOn && branches.get(wasOn)) {
      trial = branches.get(wasOn);
      refreshBase();
      loadSnapshot(deriveBoard(trial));
    } else if (wasOn) {
      trial = null;
      document.body.classList.remove("trialing");
      if (trunk.saved) loadSnapshot(trunk.saved);
      toast("That branch was removed");
    }
  }
  /* Anything still queued has not reached anyone else, so nothing in the copy
     we just merged can legitimately have replaced it. Re-apply it or your own
     marks can blink out until the next write lands. */
  for (const op of pending) applyOp(room, op);

  if (branchView) {
    if (trial && branches.get(trial.id)) {
      refreshBase();
      loadSnapshot(deriveBoard(trial));
    } else {
      trial = null;
      document.body.classList.remove("trialing");
      loadSnapshot(trunk.saved);
    }
  }
  mergePlayers(room.players, remote.players);
  if (remote.solvedAt && !room.solvedAt) room.solvedAt = remote.solvedAt;
  // heal: re-send anything of mine the master never received
  const cutoff = now() - 15000;
  recent = recent.filter(op2 => op2.t > cutoff);
  for (const op of recent) {
    const stale =
      op.d !== undefined
        ? room.dt[op.d] < op.t && room.diag[op.d] !== op.val
        : op.k !== undefined
          ? room.ct[op.k] < op.t && room.cells[op.k] !== op.val
          : room.et[op.e] < op.t && room.edges[op.e] !== op.val;
    if (stale) {
      applyOp(room, op);
      pending.push(op);
    }
  }
  render();
}

async function flush() {
  if (!room || writing) return;
  writing = true;
  /* What gets written is the master, which lives in trunk.saved while a branch
     is open. The board itself is left alone: swapping room over to the master
     for the duration of the round trip made the branch visibly flash back to
     the master on every write. */
  const onBranch = !!trial;
  const masterBoard = onBranch ? trunk.saved || boardSnapshot() : null;
  const mine = pending;
  pending = [];
  try {
    const res = await store.get(ROOM_KEY(room.code), true);
    let base = res ? JSON.parse(res.value) : null;
    if (!base || base.gen !== room.gen) {
      if (base && base.gen > room.gen) {
        adopt(base);
        writing = false;
        return;
      }
      base = onBranch
        ? {
            ...room,
            edges: masterBoard.edges,
            cells: masterBoard.cells,
            diag: masterBoard.diag,
            eo: masterBoard.eo.slice(),
          }
        : room;
    }
    if (base.now) tOffset = Math.max(tOffset, base.now - Date.now());
    for (const op of mine) applyOp(base, op);
    mergePlayers(base.players, room.players);
    // branch records merge per id, newest wins
    ensureTree(base);
    ensureTree(room);
    for (const id in room.tree) {
      const mineRec = room.tree[id],
        theirs = base.tree[id];
      base.tree[id] = mergeBranchRecord(theirs, mineRec);
    }
    touchMe(base);
    if (room.solvedAt && !base.solvedAt) base.solvedAt = room.solvedAt;
    base.now = Date.now();
    await store.set(ROOM_KEY(room.code), JSON.stringify(base), true);
    lastWrite = Date.now();
    /* Anything recorded while this write was in flight is missing from `base`:
       edge/cell ops are still in `pending`, and branch marks are in the local
       tree. Carry both across or the board visibly loses them. */
    const localTree = room.tree || {};
    const view = onBranch
      ? { edges: room.edges, cells: room.cells, diag: room.diag, eo: room.eo }
      : null;
    room = base;
    ensureTree(room);
    for (const id in localTree) {
      const mineRec = localTree[id],
        theirs = room.tree[id];
      room.tree[id] = mergeBranchRecord(theirs, mineRec);
    }
    for (const op of pending) applyOp(room, op);
    /* Gate on the branch open *now*, not the one open when this write began:
       switching (or accepting) during the round trip would otherwise leave the
       master's board on screen with the branch's marks missing. */
    if (trial || onBranch) {
      if (onBranch || !view) trunk.saved = boardSnapshot(); // the freshly merged sheet
      syncTreeFromRoom();
      if (trial) {
        refreshBase();
        loadSnapshot(deriveBoard(trial));
      } else if (view) {
        room.edges = view.edges;
        room.cells = view.cells;
        room.diag = view.diag;
        room.eo = view.eo;
      }
    }
    render();
  } catch (edge) {
    pending = mine.concat(pending); // put them back, try next tick
  }
  writing = false;
}

function queueOp(edge, val) {
  if (trial) {
    // goes into the branch, not the master
    const value = String(val);
    if (room.edges[edge] === value) return false;
    if (!trial.premise) {
      const taken = premiseTaken(trial.parent || null, "edge", edge, trial.id);
      if (taken) {
        toast("Another branch here already guesses at that square");
        return false;
      }
    }
    const above = settledAbove("edge", edge);
    if (above) {
      toast("The branch above already decided this. A branch can only add to it.");
      return false;
    }
    /* The assumption can be taken back, but not swapped for another.
       Changing it in place left the old fork standing beside the new
       one — clear it and guess again, which unmakes the pair first. */
    if (trial.premise && trial.premise.kind === "edge" && trial.premise.idx === edge) {
      if (value === trial.premise.to) return false;
      if (value !== "0") {
        toast("Clear this branch's assumption before guessing something else");
        return false;
      }
      if (!undoesPremise("edge", edge, value)) unmakePremise(trial);
    }
    if (undoesPremise("edge", edge, value)) {
      toast("That is this branch's assumption. Clear the rest of the branch first.");
      return false;
    }
    notePremise("edge", edge, room.edges[edge], value);
    room.edges = room.edges.slice(0, edge) + value + room.edges.slice(edge + 1);
    room.eo[edge] = penSlot(me.id);
    recordMark(trial, "edge", edge, value);
    return true;
  }
  const op = { e: edge, val: String(val), t: now(), by: penSlot(me.id) };
  if (playerIdx(room, me.id) < 0) touchMe(room);
  if (!applyOp(room, op)) return false;
  const player = room.players[op.by];
  if (player) player.ops = (player.ops || 0) + 1;
  pending.push(op);
  recent.push(op);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_MS);
  return true;
}



function queueDiag(cell, val) {
  ensureCells(room);
  const value = String(val);
  if (room.diag[cell] === value) return false;
  if (trial) {
    room.diag = room.diag.slice(0, cell) + value + room.diag.slice(cell + 1);
    recordMark(trial, "diag", cell, value);
    return true;
  }
  const op = { d: cell, val: value, t: now() };
  if (!applyOp(room, op)) return false;
  pending.push(op);
  recent.push(op);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_MS);
  return true;
}

function queueCell(cell, val) {
  ensureCells(room);
  if (trial) {
    const value = String(val);
    if (room.cells[cell] === value) return false;
    if (!trial.premise) {
      const taken = premiseTaken(trial.parent || null, "cell", cell, trial.id);
      if (taken) {
        toast("Another branch here already guesses at that square");
        return false;
      }
    }
    const above = settledAbove("cell", cell);
    if (above) {
      toast("The branch above already decided this. A branch can only add to it.");
      return false;
    }
    /* The assumption can be taken back, but not swapped for another.
       Changing it in place left the old fork standing beside the new
       one — clear it and guess again, which unmakes the pair first. */
    if (trial.premise && trial.premise.kind === "cell" && trial.premise.idx === cell) {
      if (value === trial.premise.to) return false;
      if (value !== "0") {
        toast("Clear this branch's assumption before guessing something else");
        return false;
      }
      if (!undoesPremise("cell", cell, value)) unmakePremise(trial);
    }
    if (undoesPremise("cell", cell, value)) {
      toast("That is this branch's assumption. Clear the rest of the branch first.");
      return false;
    }
    notePremise("cell", cell, room.cells[cell], value);
    room.cells = room.cells.slice(0, cell) + value + room.cells.slice(cell + 1);
    recordMark(trial, "cell", cell, value);
    return true;
  }
  const op = { k: cell, val: String(val), t: now() };
  if (!applyOp(room, op)) return false;
  pending.push(op);
  recent.push(op);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_MS);
  return true;
}

async function poll() {
  if (!store.ok || !room) return;
  const res = await store.get(ROOM_KEY(room.code), true);
  if (res) {
    try {
      adopt(JSON.parse(res.value));
    } catch (edge) {}
  }
  if (Date.now() - lastWrite > HEARTBEAT_MS && !pending.length) {
    touchMe(room);
    flush();
  } else render();
}

async function updateIndex() {
  if (!store.ok || !room) return;
  const res = await store.get(INDEX_KEY, true);
  let idx = {};
  if (res) {
    try {
      idx = JSON.parse(res.value) || {};
    } catch (edge) {}
  }
  const live = room.players.filter(player => now() - player.seen < IDLE_MS).length;
  idx[room.code] = {
    R: room.R,
    C: room.C,
    diff: room.diff,
    players: live,
    updated: Date.now(),
    solved: !!room.solvedAt,
  };
  const cut = Date.now() - 1000 * 60 * 60 * 3;
  for (const cell of Object.keys(idx)) if (!idx[cell] || idx[cell].updated < cut) delete idx[cell];
  await store.set(INDEX_KEY, JSON.stringify(idx), true);
}

/* Ways for the rest of the program to set what this file owns. */
function setEngine(value) {
  engine = value;
  return value;
}
function setFlushTimer(value) {
  flushTimer = value;
  return value;
}
function setIndexTimer(value) {
  indexTimer = value;
  return value;
}
function setLastWrite(value) {
  lastWrite = value;
  return value;
}
function setMe(value) {
  me = value;
  return value;
}
function setPending(value) {
  pending = value;
  return value;
}
function setPollTimer(value) {
  pollTimer = value;
  return value;
}
function setRecent(value) {
  recent = value;
  return value;
}
function setRoom(value) {
  room = value;
  return value;
}
function setSolvedShown(value) {
  solvedShown = value;
  return value;
}
function setTrial(value) {
  trial = value;
  return value;
}

/* what other parts of the program use from here */
export {
  ALPHABET,
  AUTO_PENS,
  FLUSH_MS,
  HEARTBEAT_MS,
  IDLE_MS,
  INDEX_KEY,
  ME_KEY,
  PENS,
  POLL_MS,
  ROOM_KEY,
  adopt,
  applyOp,
  blankRoom,
  engine,
  ensureCells,
  flush,
  flushTimer,
  indexTimer,
  lastNow,
  lastWrite,
  me,
  mergePlayers,
  now,
  pending,
  playerIdx,
  poll,
  pollTimer,
  queueCell,
  queueDiag,
  queueOp,
  randCode,
  recent,
  room,
  setEngine,
  setFlushTimer,
  setIndexTimer,
  setLastWrite,
  setMe,
  setPending,
  setPollTimer,
  setRecent,
  setRoom,
  setSolvedShown,
  setTrial,
  solvedShown,
  store,
  tOffset,
  touchMe,
  trial,
  uid,
  updateIndex,
  writing,
};
