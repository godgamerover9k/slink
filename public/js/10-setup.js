/* ============================================================
   8. Setup screen
   ============================================================ */
const SIZES = [
  [5, 5],
  [7, 7],
  [10, 10],
  [15, 15],
  [20, 20],
  [30, 30],
];
const MIN_DIM = 2,
  MAX_DIM = 100;
let pickDiff = "standard",
  keepRoomOnClose = false,
  generating = false;

const veil = document.getElementById("veil");
const errEl = document.getElementById("err");
const rowsIn = document.getElementById("rowsIn");
const colsIn = document.getElementById("colsIn");
const sizeHint = document.getElementById("sizeHint");

function rawDims() {
  return [parseInt(rowsIn.value, 10), parseInt(colsIn.value, 10)];
}
function dimsOk() {
  const [R, C] = rawDims();
  return (
    Number.isFinite(R) &&
    Number.isFinite(C) &&
    R >= MIN_DIM &&
    C >= MIN_DIM &&
    R <= MAX_DIM &&
    C <= MAX_DIM
  );
}
function setDims(R, C) {
  rowsIn.value = R;
  colsIn.value = C;
  refreshSize();
}

/* honest about what a big puzzle or a maximal sweep is going to cost */
function refreshSize() {
  const [R, C] = rawDims(),
    ok = dimsOk(),
    node = ok ? R * C : 0;
  document
    .querySelectorAll("#sizeChips .chip")
    .forEach((btn, i) =>
      btn.setAttribute("aria-pressed", ok && SIZES[i][0] === R && SIZES[i][1] === C),
    );
  /* Two separate warnings: one about the size, which belongs beside the size
     boxes, and one about how long this difficulty will take, which belongs
     under the difficulty buttons. */
  let msg,
    warn = false;
  if (!ok) {
    msg = `${MIN_DIM}–${MAX_DIM} per side`;
    warn = true;
  } else if (Math.max(R, C) > 30) {
    msg = `${node} cells · very large, build it in slink-gen and import it`;
    warn = true;
  } else msg = node + " cells";

  const diffHint = document.getElementById("diffHint");
  if (diffHint) {
    let data = "",
      dwarn = false;
    if (ok && pickDiff === "maximal" && node > 256) {
      data = "at this size, Maximal can take several minutes to build";
      dwarn = true;
    } else if (ok && pickDiff === "maximal" && node > 144) {
      data = "Maximal takes a while at this size";
    } else if (pickDiff === "maximal") {
      data = "as few clues as the puzzle can keep — hardest";
    } else if (pickDiff === "tough") {
      data = "fewer clues, harder going";
    } else if (pickDiff === "gentle") {
      data = "plenty of clues to work from";
    }
    diffHint.textContent = data;
    diffHint.classList.toggle("warn", dwarn);
  }
  sizeHint.textContent = msg;
  sizeHint.classList.toggle("warn", warn);
  // never re-enable mid-build: changing a setting used to start a second one
  document.getElementById("createBtn").disabled = !ok || generating;
}
rowsIn.addEventListener("input", refreshSize);
colsIn.addEventListener("input", refreshSize);

const genEls = {
  box: document.getElementById("gen"),
  fill: document.getElementById("genFill"),
  stage: document.getElementById("genStage"),
  pct: document.getElementById("genPct"),
  note: document.getElementById("genNote"),
};
let genT0 = 0,
  genPaint = 0;

const elapsed = ms => {
  const s = Math.round(ms / 1000);
  return s < 60 ? s + "s" : Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s";
};

function genStart() {
  genT0 = Date.now();
  genPaint = 0;
  genEls.box.hidden = false;
  genEls.box.classList.add("gen--wait");
  genEls.stage.textContent = "Laying out a loop";
  genEls.pct.textContent = "0s";
  genEls.fill.style.width = "";
  genEls.note.textContent = "finding a puzzle with just one solution";
}
function genStop() {
  genEls.box.hidden = true;
  genEls.box.classList.remove("gen--wait");
}

/* throttled — the trimming phase reports on every clue it checks */
function genUpdate(info) {
  const text = Date.now();
  if (text - genPaint < 90) return;
  genPaint = text;
  const el = elapsed(text - genT0);
  if (info.stage === "loop") {
    genEls.box.classList.add("gen--wait");
    genEls.stage.textContent = "Laying out a loop";
    genEls.pct.textContent = el;
    genEls.fill.style.width = "";
    genEls.note.textContent = `attempt ${info.attempt} · looking for a loop with exactly one solution`;
    return;
  }
  genEls.box.classList.remove("gen--wait");
  genEls.stage.textContent =
    info.pass > 1 ? `Trimming clues · pass ${info.pass}` : "Trimming clues";
  genEls.pct.textContent = Math.round(info.frac * 100) + "%";
  genEls.fill.style.width = (info.frac * 100).toFixed(1) + "%";
  const bits = [`${info.checked}/${info.total} checked`, `${info.kept} clues left`];
  if (info.hard) bits.push("deeper search");
  bits.push(el);
  genEls.note.textContent =
    bits.join(" · ") +
    (info.minimal && info.pass > 1 ? " · taking out every clue it can" : "");
}

function buildChips() {
  const sc = document.getElementById("sizeChips");
  sc.innerHTML = "";
  SIZES.forEach(([r, c]) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = `${r}×${c}`;
    btn.setAttribute("aria-pressed", "false");
    btn.onclick = () => setDims(r, c);
    sc.appendChild(btn);
  });
  const dc = document.getElementById("diffChips");
  dc.innerHTML = "";
  Object.entries(DIFFS).forEach(([cell, data]) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = data.label;
    btn.setAttribute("aria-pressed", cell === pickDiff);
    btn.onclick = () => {
      pickDiff = cell;
      buildChips();
    };
    dc.appendChild(btn);
  });
  refreshSize();
}

function openSetup(keepRoom) {
  keepRoomOnClose = !!keepRoom;
  veil.hidden = false;
  document.getElementById("cardTitle").textContent = keepRoom
    ? "New puzzle for this room"
    : "Start plotting";
  document.getElementById("cardSub").textContent = keepRoom
    ? "Everyone on " + room.code + " gets the new puzzle as soon as it's ready."
    : "One puzzle, one board, everybody's pens at once. Open a puzzle and share the code, or join one that's already running.";
  document.querySelector(".tabs").hidden = !!keepRoom;
  document.getElementById("paneJoin").hidden = true;
  document.getElementById("paneNew").hidden = false;
  errEl.textContent = "";
}
function closeSetup() {
  veil.hidden = true;
}

document.getElementById("tabNew").onclick = () => switchTab(true);
document.getElementById("tabJoin").onclick = () => switchTab(false);
function switchTab(isNew) {
  document.getElementById("tabNew").setAttribute("aria-selected", isNew);
  document.getElementById("tabJoin").setAttribute("aria-selected", !isNew);
  document.getElementById("paneNew").hidden = !isNew;
  document.getElementById("paneJoin").hidden = isNew;
  errEl.textContent = "";
}

function readName() {
  const value = (document.getElementById("nameIn").value || "").trim().slice(0, 18);
  return value || "Anon";
}

async function saveMe() {
  me.name = readName();
  await store.set(ME_KEY, JSON.stringify(me), false);
}

async function openPuzzle(puz) {
  const code = keepRoomOnClose ? room.code : randCode();
  const fresh = blankRoom(code, puz);
  let restoreTree = null;
  if (puz.progress) {
    // restore an exported sheet mid-solve
    const pr = puz.progress,
      node = puz.R * puz.C;
    fresh.edges = pr.edges;
    if (typeof pr.cells === "string" && pr.cells.length === node) fresh.cells = pr.cells;
    if (typeof pr.diag === "string" && pr.diag.length === node) fresh.diag = pr.diag;
    const text = now();
    fresh.et = fresh.et.map(() => text);
    fresh.ct = fresh.ct.map(() => text);
    fresh.dt = fresh.dt.map(() => text);
    /* Lines are coloured by whose pen drew them. Restored ones had no owner,
       so they came back graphite while anything drawn afterwards used your
       pen — the same sheet in two colours for no reason. Adopt them. */
    touchMe(fresh);
    const mineIdx = penSlot(me.id);
    fresh.eo = fresh.eo.map((value, i) => (fresh.edges[i] === "1" ? mineIdx : value));
    if (pr.tree && typeof pr.tree === "object") restoreTree = pr.tree;
  }
  if (restoreTree) fresh.tree = restoreTree;
  if (keepRoomOnClose && room) mergePlayers(fresh.players, room.players);
  room = fresh;
  engine = Engine(puz.R, puz.C);
  pending = [];
  recent = [];
  undoStack = [];
  redoStack = [];
  solvedShown = false;
  clearBranches();
  touchMe(room);
  buildBoard();
  if (restoreTree) {
    trunk.saved = boardSnapshot();
    syncTreeFromRoom();
  }
  render();
  enterRoom(code);
  await store.set(ROOM_KEY(code), JSON.stringify(room), true);
  lastWrite = Date.now();
  updateIndex();
  closeSetup();
  if (!keepRoomOnClose) toast("Puzzle " + code + " is open — share the code");
}

/* ---- importing packs built by slink-gen ---- */
const PACK_MAX = 200;

function readPuzzle(opt, i) {
  const where = `puzzle ${i + 1}`;
  if (!opt || typeof opt !== "object") throw new Error(`${where} is not a puzzle`);
  const R = Math.trunc(opt.R),
    C = Math.trunc(opt.C);
  if (!(R >= 2 && C >= 2)) throw new Error(`${where} has a grid smaller than 2×2`);
  if (R > PACK_MAX || C > PACK_MAX)
    throw new Error(`${where} is larger than ${PACK_MAX} a side`);
  if (!Array.isArray(opt.clues)) throw new Error(`${where} has no clue list`);
  if (opt.clues.length !== R * C)
    throw new Error(`${where} lists ${opt.clues.length} clues for a ${R}×${C} grid`);
  const clues = opt.clues.map(value => {
    const node = value === null || value === undefined || value === "" ? -1 : Math.trunc(value);
    if (!Number.isFinite(node) || node < -1 || node > 4)
      throw new Error(`${where} has a clue outside 0–4`);
    return node;
  });
  const given = clues.filter(value => value >= 0).length;
  const out = {
    R,
    C,
    clues,
    given,
    diff: DIFFS[opt.diff] ? opt.diff : "imported",
    minimal: !!opt.minimal,
  };
  const pr = opt.progress;
  if (pr && typeof pr.edges === "string" && pr.edges.length === (R + 1) * C + R * (C + 1)) {
    out.progress = pr;
    if (pr.tree && typeof pr.tree !== "object") delete out.progress.tree;
  }
  return out;
}

function readPack(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a puzzle file.");
  }
  if (data && data.format && data.format !== "slitherlink-pack")
    throw new Error(`That looks like a "${data.format}" file, not a Slitherlink pack.`);
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data && data.puzzles)
      ? data.puzzles
      : [data];
  if (!list.length) throw new Error("That pack has no puzzles in it.");
  return {
    meta: data && data.generator ? data.generator : "unknown source",
    puzzles: list.map(readPuzzle),
  };
}

/* an imported puzzle is only worth opening if it really has one solution */
function vetPuzzle(puz) {
  const gg = Engine(puz.R, puz.C),
    CELL = Solver(gg);
  const res = CELL.solve(Int8Array.from(puz.clues), 2, Math.max(400000, gg.NC * 4000));
  if (res.aborted)
    return { ok: true, warn: "couldn't finish checking this one — opening it anyway" };
  if (res.count === 0) return { ok: false, why: "that puzzle has no solution" };
  if (res.count > 1) return { ok: false, why: "that puzzle has more than one solution" };
  return { ok: true };
}

function showPack(pack) {
  const box = document.getElementById("packList");
  box.hidden = false;
  box.innerHTML = "";
  pack.puzzles.forEach((player, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pk";
    btn.innerHTML = `<span></span><span class="pk__meta"></span>`;
    btn.children[0].textContent = `${player.R}×${player.C} · ${player.given} clues`;
    btn.children[1].textContent =
      (DIFFS[player.diff] ? DIFFS[player.diff].label : player.diff) + (player.minimal ? " · minimal" : "");
    btn.onclick = async () => {
      errEl.textContent = "";
      const was = btn.children[1].textContent;
      btn.children[1].textContent = "checking…";
      btn.disabled = true;
      await new Promise(r => setTimeout(r, 20));
      const value = vetPuzzle(player);
      btn.children[1].textContent = was;
      btn.disabled = false;
      if (!value.ok) {
        errEl.textContent = `Import refused — ${value.why}.`;
        return;
      }
      await saveMe();
      await openPuzzle(player);
      if (value.warn) toast("Imported, but " + value.warn);
      box.hidden = true;
    };
    box.appendChild(btn);
  });
  errEl.textContent = "";
  toast(
    `${pack.puzzles.length} puzzle${pack.puzzles.length === 1 ? "" : "s"} from ${pack.meta} — pick one`,
  );
}

/* The packaged binaries are far too big to live inside this page, so it looks for
   them next to wherever the page is served from and links only if they exist. */
const EXE_NAMES = {
  win: "slink-gen-win-x64.exe",
  mac: "slink-gen-macos-arm64",
  macIntel: "slink-gen-macos-x64",
  linux: "slink-gen-linux-x64",
};
async function offerExe() {
  const anchor = document.getElementById("getExe");
  if (!anchor || !/^https?:$/.test(location.protocol)) return;
  const ua = navigator.userAgent || "";
  const pick = /Windows/i.test(ua)
    ? EXE_NAMES.win
    : /Mac/i.test(ua)
      ? /ARM|Apple/i.test(ua)
        ? EXE_NAMES.mac
        : EXE_NAMES.macIntel
      : EXE_NAMES.linux;
  // try the likely one first, then the rest, so a wrong guess still offers
  // something rather than nothing
  const order = [pick, ...Object.values(EXE_NAMES).filter(node => node !== pick)];
  for (const name of order) {
    try {
      const r = await fetch(name, { method: "HEAD" });
      if (r.ok) {
        anchor.href = name;
        anchor.textContent = "Download slink-gen (" + name.replace(/^slink-gen-/, "") + ")";
        anchor.setAttribute("download", name);
        anchor.hidden = false;
        return;
      }
    } catch (edge) {
      /* not published alongside the page */
    }
  }
}

document.getElementById("getGen").onclick = () => {
  // served as a file rather than carried inside the page, which kept 100KB of
  // generator in every page load for the few people who ever download it
  const anchor = document.createElement("a");
  anchor.href = "download/slink-gen.js";
  anchor.download = "slink-gen.js";
  anchor.click();
  toast("Needs Node 18+. Run: node slink-gen.js --help");
};

document.getElementById("importBtn").onclick = async () => {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "Slitherlink", accept: { "application/json": [".json"] } }],
      });
      const file = await handle.getFile();
      const pack = readPack(await file.text());
      loadedFrom = { name: file.name, handle: handle };
      showPack(pack);
      if (pack.puzzles.length === 1) document.querySelector("#packList .pk").click();
      return;
    } catch (edge) {
      if (edge && edge.name === "AbortError") return; // they closed the picker
      errEl.textContent = edge.message || "Couldn't read that file.";
      return;
    }
  }
  document.getElementById("packIn").click();
};
document.getElementById("packIn").onchange = async edge => {
  const file = edge.target.files && edge.target.files[0];
  edge.target.value = "";
  if (!file) return;
  try {
    const pack = readPack(await file.text());
    loadedFrom = { name: file.name || "the file you opened", handle: null };
    showPack(pack);
    if (pack.puzzles.length === 1) document.querySelector("#packList .pk").click();
  } catch (err) {
    document.getElementById("packList").hidden = true;
    errEl.textContent = err.message || "Couldn't read that pack.";
  }
};

document.getElementById("createBtn").onclick = async () => {
  const btn = document.getElementById("createBtn");
  if (generating) return;
  if (!dimsOk()) {
    errEl.textContent = `Rows and columns each need to be between ${MIN_DIM} and ${MAX_DIM}.`;
    return;
  }
  const [R, C] = rawDims();
  await saveMe();
  generating = true;
  btn.disabled = true;
  errEl.textContent = "";
  btn.textContent = "Plotting a puzzle…";
  genStart();
  try {
    const puz = await generateAsync(R, C, pickDiff, genUpdate);
    puz.diff = pickDiff;
    await openPuzzle(puz);
  } catch (edge) {
    errEl.textContent = edge.message || "Something went wrong building that puzzle.";
  }
  generating = false;
  genStop();
  btn.textContent = "Generate the puzzle";
  refreshSize();
};

document.getElementById("joinBtn").onclick = () =>
  joinRoom(document.getElementById("codeIn").value);
document.getElementById("codeIn").addEventListener("keydown", edge => {
  if (edge.key === "Enter") document.getElementById("joinBtn").click();
});

async function joinRoom(codeRaw) {
  const code = (codeRaw || "").trim().toUpperCase();
  errEl.textContent = "";
  if (code.length !== 4) {
    errEl.textContent = "Puzzle codes are 4 characters.";
    return false;
  }
  if (!store.ok) {
    errEl.textContent =
      "This page has nowhere to keep a shared puzzle, so joining one won't work here. Starting your own still does.";
    return false;
  }
  await saveMe();
  const res = await store.get(ROOM_KEY(code), true);
  if (!res) {
    errEl.textContent = "No puzzle with that code.";
    return false;
  }
  let data;
  try {
    data = JSON.parse(res.value);
  } catch (edge) {
    errEl.textContent = "That puzzle couldn't be read.";
    return false;
  }
  room = null;
  undoStack = [];
  redoStack = [];
  clearBranches();
  adopt(data);
  touchMe(room);
  enterRoom(code);
  closeSetup();
  flush();
  updateIndex();
  toast("Joined puzzle " + code);
  return true;
}

/* A link that opens straight into a puzzle. It carries the room server and key
   too when they are set, so one link is all anyone needs. */
function roomLink(code) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", code);
  if (store.base) url.searchParams.set("server", store.base);
  if (store.key) url.searchParams.set("k", store.key);
  return url.toString();
}

/* Where the rooms live, when the page itself is hosted somewhere that can't
   run a server. Stored per browser, so it only has to be set once. */
function wireServerBox() {
  const box = document.getElementById("serverIn");
  const note = document.getElementById("serverNote");
  if (!box) return;
  box.value = store.base || "";
  const say = () => {
    if (!note) return;
    note.textContent = store.base
      ? store.ok
        ? "Connected to " + store.base
        : "Can't reach " + store.base
      : store.ok
        ? "Using the site this page came from."
        : "No room server. Paste one above, or play on your own.";
  };
  say();
  const apply = async () => {
    const value = box.value.trim().replace(/\/+$/, "");
    if (value === (store.base || "")) return;
    store.base = value;
    try {
      value
        ? window.localStorage.setItem("sl:server", value)
        : window.localStorage.removeItem("sl:server");
    } catch (edge) {}
    store.mode = "memory";
    store.needsKey = false;
    store.denied = false;
    if (note) note.textContent = "Checking…";
    await store.probe();
    say();
    soloNotice();
  };
  box.onchange = apply;
  box.onkeydown = edge => {
    if (edge.key === "Enter") {
      edge.preventDefault();
      apply();
    }
  };
}

function soloNotice() {
  const locked = store.mode === "http" && (store.needsKey || store.denied);
  if (locked) {
    const note = document.getElementById("soloNote");
    if (note) {
      note.hidden = false;
      note.innerHTML =
        "This server needs a room key. Ask whoever is hosting for " +
        "their link — it looks like <b>http://…/?k=KEY</b>. Without it you can " +
        "still play on your own here.";
    }
    const jb = document.getElementById("joinBtn");
    if (jb) jb.disabled = true;
    return;
  }
  const solo = !store.ok;
  const note = document.getElementById("soloNote");
  if (note) note.hidden = !solo;
  const jb = document.getElementById("joinBtn");
  if (jb) jb.disabled = solo;
  const jn = document.getElementById("joinNote");
  if (jn)
    jn.textContent = solo
      ? "Sharing needs a room server. Run slink-server on one computer with this page beside it, and everyone opens the address it prints."
      : "Ask whoever started the puzzle for its 4-letter code — it's shown at the top of their window, next to Copy.";
}

/* remember the sheet you were on and pick it back up next time */
const LAST_KEY = "sl:last";
async function resumeLast() {
  try {
    const res = await store.get(LAST_KEY, false);
    if (!res) return false;
    const saved = JSON.parse(res.value);
    if (!saved || !saved.room) return false;
    room = null;
    undoStack = [];
    redoStack = [];
    clearBranches();
    adopt(saved.room);
    if (!room) return false;
    touchMe(room);
    enterRoom(room.code);
    closeSetup();
    toast("Picked up where you left off");
    return true;
  } catch (edge) {
    return false;
  }
}
async function rememberLast() {
  if (!room) return;
  try {
    await store.set(LAST_KEY, JSON.stringify({ at: Date.now(), room }), false);
  } catch (edge) {}
}

/* The address bar becomes the link to this puzzle, so copying out of the
   browser works as well as the Copy link button. It carries the room server
   and key when they are set, because a link without them opens nothing. */
function showRoomLink(code) {
  const link = roomLink(code);
  const anchor = document.getElementById("roomcode");
  if (anchor) {
    anchor.textContent = code;
    anchor.href = link;
    anchor.title = link;
  }
  try {
    history.replaceState(null, "", link);
  } catch (edge) {}
  return link;
}

function enterRoom(code) {
  // A code is an invitation. With no server behind it there is nothing to
  // invite anyone to, so showing one only misleads.
  const chip = document.getElementById("roomchip");
  if (chip) chip.hidden = !store.ok;
  const edit = document.getElementById("meEdit");
  if (edit) edit.hidden = false;      // your name and colour, once you are in
  // record the resume point straight away: on a 5s timer alone, closing the
  // tab quickly after joining lost it
  setTimeout(() => {
    if (room) rememberLast();
  }, 0);
  showRoomLink(code);
  clearInterval(pollTimer);
  clearInterval(indexTimer);
  pollTimer = setInterval(poll, POLL_MS);
  indexTimer = setInterval(() => {
    if (room) updateIndex();
  }, 60000);
}
