/* ============================================================
   4. Shared sheet state
   ============================================================ */
const PENS = ["--pen-1", "--pen-2", "--pen-3", "--pen-4", "--pen-5", "--pen-6"];
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_KEY = c => "sl:room:" + c;
const INDEX_KEY = "sl:index";
const ME_KEY = "sl:me";
const POLL_MS = 3000,
  FLUSH_MS = 380,
  HEARTBEAT_MS = 18000,
  IDLE_MS = 45000;

const store = {
  /* Three ways to keep a sheet, tried in order:
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
      const u = new URL(location.href);
      let sv = u.searchParams.get("server");
      if (sv !== null) {
        u.searchParams.delete("server");
        history.replaceState(null, "", u.toString());
        try {
          sv
            ? window.localStorage.setItem("sl:server", sv)
            : window.localStorage.removeItem("sl:server");
        } catch (e) {}
      } else {
        try {
          sv = window.localStorage.getItem("sl:server") || "";
        } catch (e) {
          sv = "";
        }
      }
      return (sv || "").replace(/\/+$/, "");
    } catch (e) {
      return "";
    }
  })(),
  key: (() => {
    try {
      const u = new URL(location.href);
      const k = u.searchParams.get("k");
      if (k !== null) {
        u.searchParams.delete("k");
        history.replaceState(null, "", u.toString());
        // remembered like the server address, so the full link is needed once
        try {
          k
            ? window.localStorage.setItem("sl:key", k)
            : window.localStorage.removeItem("sl:key");
        } catch (e) {}
        return k || "";
      }
      try {
        return window.localStorage.getItem("sl:key") || "";
      } catch (e) {
        return "";
      }
    } catch (e) {
      return "";
    }
  })(),
  kv(path) {
    return this.base + "/kv/" + path + (this.key ? "?k=" + encodeURIComponent(this.key) : "");
  },

  /* Private things — your name, the sheet you were last on — belong to you,
     not to the room. Outside the artifact runtime they go in this browser's
     own storage; sending them to a shared server would have every player
     overwriting everyone else's. */
  localGet(k) {
    try {
      const v = window.localStorage.getItem(k);
      return v === null ? null : { key: k, value: v };
    } catch (e) {
      return this.mem.has(k) ? { key: k, value: this.mem.get(k) } : null;
    }
  },
  localSet(k, v) {
    try {
      window.localStorage.setItem(k, v);
    } catch (e) {}
    return { key: k, value: v };
  },
  get ok() {
    return this.mode === "artifact" || this.mode === "http";
  },
  get solo() {
    return !this.ok;
  },
  get shared() {
    return this.mode === "http" ? "server" : this.mode === "artifact" ? "artifact" : "none";
  },

  async probe() {
    if (typeof window !== "undefined" && window.storage) {
      try {
        await window.storage.set("sl:probe", String(Date.now()), true);
        this.mode = "artifact";
        return true;
      } catch (e) {
        /* fall through and try a server */
      }
    }
    if (this.base || (typeof location !== "undefined" && /^https?:$/.test(location.protocol))) {
      try {
        const r = await fetch(this.base + "/kv/__health", { cache: "no-store" });
        if (r.ok) {
          this.mode = "http";
          this.needsKey = (await r.text()).includes("key") && !this.key;
          return true;
        }
      } catch (e) {
        /* not served by a room server */
      }
    }
    this.mode = "memory";
    return false;
  },

  async get(k, shared) {
    if (this.mode === "artifact") {
      try {
        return await window.storage.get(k, shared);
      } catch (e) {}
    } else if (shared === false) {
      return this.localGet(k);
    } else if (this.mode === "http") {
      try {
        const r = await fetch(this.kv(encodeURIComponent(k)), { cache: "no-store" });
        if (r.status === 404) return null;
        if (r.status === 401) {
          this.denied = true;
          return null;
        }
        if (r.ok) return { key: k, value: await r.text() };
      } catch (e) {}
    }
    return this.mem.has(k) ? { key: k, value: this.mem.get(k) } : null;
  },

  async set(k, v, shared) {
    this.mem.set(k, v);
    if (this.mode === "artifact") {
      try {
        return await window.storage.set(k, v, shared);
      } catch (e) {
        this.mode = "memory";
      }
    } else if (shared === false) {
      return this.localSet(k, v);
    } else if (this.mode === "http") {
      try {
        const r = await fetch(this.kv(encodeURIComponent(k)), { method: "PUT", body: v });
        if (r.status === 401) this.denied = true;
      } catch (e) {
        /* keep playing from memory; the next write may get through */
      }
    }
    return { key: k, value: v };
  },
};

let me = null; // {id,name}
let room = null; // last merged shared state
let engine = null; // engine for the current sheet
let pending = []; // ops not yet written
let recent = []; // ops kept briefly so a lost write can heal
let trial = null; // snapshot of the sheet while a fork is being tried
let tOffset = 0; // clock alignment with other pens
let pollTimer = null,
  indexTimer = null,
  flushTimer = null,
  writing = false,
  lastWrite = 0;
let solvedShown = false;

/* strictly increasing: two marks inside the same millisecond would otherwise
   tie on the last-write-wins check and the second would be dropped */
let lastNow = 0;
const now = () => {
  const t = Math.max(Date.now() + tOffset, lastNow + 1);
  lastNow = t;
  return t;
};
const randCode = () =>
  Array.from({ length: 4 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join("");
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

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
    rels: {},
    rt: {}, // "a:b" -> "s" same side | "d" opposite
    players: [],
    solvedAt: null,
    now: Date.now(),
  };
}

function playerIdx(r, id) {
  return r.players.findIndex(p => p.id === id);
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

/* sheets made before cell marks existed arrive without these fields */
function ensureCells(r) {
  const n = r.R * r.C;
  if (typeof r.cells !== "string" || r.cells.length !== n) r.cells = "0".repeat(n);
  if (!Array.isArray(r.ct) || r.ct.length !== n) r.ct = new Array(n).fill(0);
  if (typeof r.diag !== "string" || r.diag.length !== n) r.diag = "0".repeat(n);
  if (!Array.isArray(r.dt) || r.dt.length !== n) r.dt = new Array(n).fill(0);
  if (!r.rels || typeof r.rels !== "object") r.rels = {};
  if (!r.rt || typeof r.rt !== "object") r.rt = {};
  return r;
}

function applyOp(r, op) {
  if (op.r !== undefined) {
    // a claim about two squares
    ensureCells(r);
    const k = op.r;
    if (op.t <= (r.rt[k] || 0)) return false;
    if (op.val === "0") delete r.rels[k];
    else r.rels[k] = op.val;
    r.rt[k] = op.t;
    return true;
  }
  if (op.d !== undefined) {
    // diagonal scribble, no gameplay effect
    ensureCells(r);
    const k = op.d;
    if (op.t <= r.dt[k]) return false;
    r.diag = r.diag.slice(0, k) + op.val + r.diag.slice(k + 1);
    r.dt[k] = op.t;
    return true;
  }
  if (op.k !== undefined) {
    // cell mark
    ensureCells(r);
    const k = op.k;
    if (op.t <= r.ct[k]) return false;
    r.cells = r.cells.slice(0, k) + op.val + r.cells.slice(k + 1);
    r.ct[k] = op.t;
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
  for (const p of incoming) {
    const j = base.findIndex(q => q.id === p.id);
    if (j < 0) base.push({ ...p });
    else if (p.seen > base[j].seen) base[j] = { ...p };
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
    undoStack = [];
    redoStack = [];
    solvedShown = !!room.solvedAt;
    trial = null;
    document.body.classList.remove("trialing");
    trunk.saved = null;
    branches = new Map();
    trunk.children = [];
    buildBoard();
    syncTreeFromRoom();
    render();
    return;
  }
  // merges are against the sheet, so swap the branch view out for the moment
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
  for (let k = 0; k < remote.ct.length; k++) {
    if (remote.ct[k] > room.ct[k]) {
      room.cells = room.cells.slice(0, k) + remote.cells[k] + room.cells.slice(k + 1);
      room.ct[k] = remote.ct[k];
    }
    if (remote.dt[k] > room.dt[k]) {
      room.diag = room.diag.slice(0, k) + remote.diag[k] + room.diag.slice(k + 1);
      room.dt[k] = remote.dt[k];
    }
  }
  for (const key in remote.rt) {
    if ((remote.rt[key] || 0) > (room.rt[key] || 0)) {
      if (remote.rels[key]) room.rels[key] = remote.rels[key];
      else delete room.rels[key];
      room.rt[key] = remote.rt[key];
    }
  }
  // the sheet is in room.* right now, so capture it before anything re-derives
  if (branchView) trunk.saved = boardSnapshot();
  // branches merge per id, newest record wins, tombstones included
  ensureTree(room);
  ensureTree(remote);
  let treeChanged = false;
  for (const id in remote.tree) {
    const rr = remote.tree[id],
      mine = room.tree[id];
    if (!mine || (rr.at || 0) > (mine.at || 0)) {
      room.tree[id] = rr;
      treeChanged = true;
    }
  }
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
  // heal: re-send anything of mine the sheet never received
  const cutoff = now() - 15000;
  recent = recent.filter(o => o.t > cutoff);
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
  /* What gets written is the sheet, which lives in trunk.saved while a branch
     is open. The board itself is left alone: swapping room over to the sheet
     for the duration of the round trip made the branch visibly flash back to
     the sheet on every write. */
  const onBranch = !!trial;
  const sheet = onBranch ? trunk.saved || boardSnapshot() : null;
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
            edges: sheet.edges,
            cells: sheet.cells,
            diag: sheet.diag,
            eo: sheet.eo.slice(),
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
      if (!theirs || (mineRec.at || 0) > (theirs.at || 0)) base.tree[id] = mineRec;
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
      if (!theirs || (mineRec.at || 0) > (theirs.at || 0)) room.tree[id] = mineRec;
    }
    for (const op of pending) applyOp(room, op);
    /* Gate on the branch open *now*, not the one open when this write began:
       switching (or accepting) during the round trip would otherwise leave the
       sheet's board on screen with the branch's marks missing. */
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
  } catch (e) {
    pending = mine.concat(pending); // put them back, try next tick
  }
  writing = false;
}

function queueOp(e, val) {
  if (trial) {
    // goes into the branch, not the sheet
    const v = String(val);
    if (room.edges[e] === v) return false;
    notePremise("edge", e, room.edges[e], v);
    room.edges = room.edges.slice(0, e) + v + room.edges.slice(e + 1);
    room.eo[e] = penSlot(me.id);
    recordMark(trial, "edge", e, v);
    return true;
  }
  const op = { e, val: String(val), t: now(), by: penSlot(me.id) };
  if (playerIdx(room, me.id) < 0) touchMe(room);
  if (!applyOp(room, op)) return false;
  const p = room.players[op.by];
  if (p) p.ops = (p.ops || 0) + 1;
  pending.push(op);
  recent.push(op);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_MS);
  return true;
}

/* A claim that two squares lie on the same side of the loop, or on opposite
   sides. Unlike a colour it says nothing about which side is which. */
function relKey(a, b) {
  return a < b ? a + ":" + b : b + ":" + a;
}

function queueRel(key, val) {
  ensureCells(room);
  const v = String(val);
  if ((room.rels[key] || "0") === v) return false;
  if (trial) {
    if (v === "0") delete room.rels[key];
    else room.rels[key] = v;
    recordMark(trial, "rel", key, v);
    return true;
  }
  const op = { r: key, val: v, t: now() };
  if (!applyOp(room, op)) return false;
  pending.push(op);
  recent.push(op);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_MS);
  return true;
}

function queueDiag(k, val) {
  ensureCells(room);
  const v = String(val);
  if (room.diag[k] === v) return false;
  if (trial) {
    room.diag = room.diag.slice(0, k) + v + room.diag.slice(k + 1);
    recordMark(trial, "diag", k, v);
    return true;
  }
  const op = { d: k, val: v, t: now() };
  if (!applyOp(room, op)) return false;
  pending.push(op);
  recent.push(op);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_MS);
  return true;
}

function queueCell(k, val) {
  ensureCells(room);
  if (trial) {
    const v = String(val);
    if (room.cells[k] === v) return false;
    notePremise("cell", k, room.cells[k], v);
    room.cells = room.cells.slice(0, k) + v + room.cells.slice(k + 1);
    recordMark(trial, "cell", k, v);
    return true;
  }
  const op = { k, val: String(val), t: now() };
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
    } catch (e) {}
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
    } catch (e) {}
  }
  const live = room.players.filter(p => now() - p.seen < IDLE_MS).length;
  idx[room.code] = {
    R: room.R,
    C: room.C,
    diff: room.diff,
    players: live,
    updated: Date.now(),
    solved: !!room.solvedAt,
  };
  const cut = Date.now() - 1000 * 60 * 60 * 3;
  for (const k of Object.keys(idx)) if (!idx[k] || idx[k].updated < cut) delete idx[k];
  await store.set(INDEX_KEY, JSON.stringify(idx), true);
}
