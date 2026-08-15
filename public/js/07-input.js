/* ============================================================
   6. Input — every mark toggles: the same click twice clears it.
      plain = line, shift or right-click = ×,
      ctrl = blue square, alt = yellow square. Drag repeats.
   ============================================================ */
const LINE = "1",
  XMARK = "2",
  BLANK = "0";
const BLUE = "1",
  YELLOW = "2",
  NOFILL = "0";
/* a mark toggles off when it's already there, otherwise it replaces what's there */
const toggleTo = (current, want) => (current === want ? BLANK : want);

let dragVal = null,
  dragWant = null,
  dragSeen = null,
  dragMode = null,
  dragVert = null,
  stroke = null,
  undoStack = [],
  redoStack = [];
let dragLast = null,
  dragFrom = null,
  diagHeld = false,
  relHeld = false,
  relFrom = -1,
  relWantSame = false;
let diagStart = null;

/* hold D for diagonal scribbles */
window.addEventListener("keydown", e => {
  if (e.key === "r" || e.key === "R") relHeld = true;
});
window.addEventListener("keyup", e => {
  if (e.key === "r" || e.key === "R") relHeld = false;
});
window.addEventListener("blur", () => {
  relHeld = false;
});
window.addEventListener("keydown", e => {
  if (e.key === "d" || e.key === "D") diagHeld = true;
});
window.addEventListener("keyup", e => {
  if (e.key === "d" || e.key === "D") diagHeld = false;
});

let view = { x: 0, y: 0, w: 0, h: 0 },
  viewFull = { w: 0, h: 0 };

function applyView() {
  if (!board || !viewFull.w) return;
  const maxW = viewFull.w,
    maxH = viewFull.h;
  // width and height must scale together: clamping them separately would
  // stretch the view and skew where clicks land
  let z = Math.max(view.w / maxW, view.h / maxH);
  z = Math.min(Math.max(z, 0.08), 1);
  view.w = maxW * z;
  view.h = maxH * z;
  view.x = Math.min(Math.max(view.x, 0), maxW - view.w);
  view.y = Math.min(Math.max(view.y, 0), maxH - view.h);
  board.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  const btn = document.getElementById("zoomReset");
  if (btn) btn.hidden = viewFull.w / view.w < 1.02;
}
function resetView() {
  view = { x: 0, y: 0, w: viewFull.w, h: viewFull.h };
  applyView();
}
function zoomAt(px, py, factor) {
  const nw = view.w / factor,
    nh = view.h / factor;
  const fx = (px - view.x) / view.w,
    fy = (py - view.y) / view.h;
  view.x = px - fx * nw;
  view.y = py - fy * nh;
  view.w = nw;
  view.h = nh;
  applyView();
}

function svgPoint(evt) {
  const r = board.getBoundingClientRect();
  const vb = board.viewBox.baseVal;
  // the viewBox origin moves when the sheet is panned or zoomed; leaving it
  // out sends every click to the wrong segment
  return {
    x: vb.x + ((evt.clientX - r.left) / r.width) * vb.width,
    y: vb.y + ((evt.clientY - r.top) / r.height) * vb.height,
  };
}

function setEdgeUser(i, val, intoStroke) {
  const before = room.edges[i];
  if (before === val) return false;
  if (!queueOp(i, val)) return false;
  const step = { e: i, from: before, to: val };
  if (intoStroke && stroke) stroke.push(step);
  else undoStack.push([step]);
  propagateDown({ kind: "edge", idx: i, from: before, to: val });
  render();
  return true;
}

function setRelUser(key, val) {
  ensureCells(room);
  const before = room.rels[key] || "0";
  if (before === val) return false;
  if (!queueRel(key, val)) return false;
  undoStack.push([{ r: key, from: before, to: val }]);
  redoStack = [];
  render();
  return true;
}

function setDiagUser(k, val, intoStroke) {
  ensureCells(room);
  const before = room.diag[k];
  if (before === val) return false;
  if (!queueDiag(k, val)) return false;
  const step = { d: k, from: before, to: val };
  if (intoStroke && stroke) stroke.push(step);
  else undoStack.push([step]);
  propagateDown({ kind: "diag", idx: k, from: before, to: val });
  render();
  return true;
}

function setCellUser(k, val, intoStroke) {
  ensureCells(room);
  const before = room.cells[k];
  if (before === val) return false;
  if (!queueCell(k, val)) return false;
  const step = { k, from: before, to: val };
  if (intoStroke && stroke) stroke.push(step);
  else undoStack.push([step]);
  propagateDown({ kind: "cell", idx: k, from: before, to: val });
  render();
  return true;
}

/* replay one undo/redo step, whichever kind of mark it was */
function applyStep(step, val) {
  if (step.r !== undefined) queueRel(step.r, val);
  else if (step.d !== undefined) queueDiag(step.d, val);
  else if (step.k !== undefined) queueCell(step.k, val);
  else queueOp(step.e, val);
}

/* which cell contains a point, or -1 */
function cellAt(x, y) {
  const c = Math.floor((x - PAD) / CELL),
    r = Math.floor((y - PAD) / CELL);
  if (r < 0 || r >= engine.R || c < 0 || c >= engine.C) return -1;
  return r * engine.C + c;
}

/* Dragging works dot to dot, not by whatever edge is nearest the pointer.
   Hit-testing every position let a small wobble beside a dot pick up the
   perpendicular edge, so a straight sweep could leave a T behind. */
function vertAt(x, y) {
  const c = Math.min(engine.C, Math.max(0, Math.round((x - PAD) / CELL)));
  const r = Math.min(engine.R, Math.max(0, Math.round((y - PAD) / CELL)));
  return { r, c };
}
const edgeBetween = (a, b) => {
  if (a.r === b.r && Math.abs(a.c - b.c) === 1) return engine.H(a.r, Math.min(a.c, b.c));
  if (a.c === b.c && Math.abs(a.r - b.r) === 1) return engine.V(Math.min(a.r, b.r), a.c);
  return -1;
};

/* walk the straight run between two dots so a fast drag doesn't skip edges */
function dragTo(v) {
  if (v.r === dragVert.r && v.c === dragVert.c) return;
  if (v.r !== dragVert.r && v.c !== dragVert.c) {
    // a sloppy or curved sweep moves diagonally between samples. Walk the
    // longer leg first rather than dropping the stroke on the floor.
    const mid =
      Math.abs(v.r - dragVert.r) >= Math.abs(v.c - dragVert.c)
        ? { r: v.r, c: dragVert.c }
        : { r: dragVert.r, c: v.c };
    dragTo(mid);
  }
  const step = v.r === dragVert.r ? Math.sign(v.c - dragVert.c) : Math.sign(v.r - dragVert.r);
  while (dragVert.r !== v.r || dragVert.c !== v.c) {
    const next =
      v.r === dragVert.r
        ? { r: dragVert.r, c: dragVert.c + step }
        : { r: dragVert.r + step, c: dragVert.c };
    const e = edgeBetween(dragVert, next);
    if (e >= 0 && !dragSeen.has(e)) {
      if (dragVal === null) dragVal = toggleTo(room.edges[e], dragWant);
      dragSeen.add(e);
      setEdgeUser(e, dragVal, true);
    }
    dragVert = next;
  }
}

/* ctrl/cmd paints blue, alt paints yellow — checked before the button,
   because ctrl+click reports as a right-click on macOS */
function fillWanted(e) {
  if (e.ctrlKey || e.metaKey) return BLUE;
  if (e.altKey) return YELLOW;
  return null;
}

/* ---- zoom and pan: needed once a sheet is bigger than the window ---- */
let panning = null,
  spaceHeld = false;
window.addEventListener("keydown", e => {
  if (e.code === "Space" && !/input|textarea/i.test((e.target || {}).tagName || "")) {
    spaceHeld = true;
  }
  if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    resetView();
  }
});
window.addEventListener("keyup", e => {
  if (e.code === "Space") spaceHeld = false;
});

/* Wheel scrolls the sheet, which is what a wheel normally does. Zooming is
   ctrl/cmd + wheel, matching every map and drawing tool. */
board.addEventListener(
  "wheel",
  e => {
    if (!room) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const p = svgPoint(e);
      zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      return;
    }
    const step = view.w / viewFull.w;
    if (e.shiftKey) {
      view.x += e.deltaY * step;
    } else {
      view.x += e.deltaX * step;
      view.y += e.deltaY * step;
    }
    applyView();
  },
  { passive: false },
);

/* arrow keys nudge the sheet when it is bigger than the window */
window.addEventListener("keydown", e => {
  if (!room || !veil.hidden) return; // only while the setup card is closed
  if (/input|textarea/i.test((e.target || {}).tagName || "")) return;
  const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
    e.key
  ];
  if (!NUDGE || view.w >= viewFull.w - 0.5) return;
  e.preventDefault();
  view.x += NUDGE[0] * view.w * 0.15;
  view.y += NUDGE[1] * view.h * 0.15;
  applyView();
});

/* middle button, or space held, drags the sheet around */
board.addEventListener(
  "pointerdown",
  e => {
    if (!room) return;
    if (e.button !== 1 && !spaceHeld) return;
    e.preventDefault();
    board.setPointerCapture(e.pointerId);
    panning = { x: e.clientX, y: e.clientY };
  },
  true,
);
board.addEventListener(
  "pointermove",
  e => {
    if (!panning) return;
    const r = board.getBoundingClientRect();
    view.x -= ((e.clientX - panning.x) / r.width) * view.w;
    view.y -= ((e.clientY - panning.y) / r.height) * view.h;
    panning = { x: e.clientX, y: e.clientY };
    applyView();
  },
  true,
);
const endPan = () => {
  panning = null;
};
board.addEventListener("pointerup", endPan, true);
board.addEventListener("pointercancel", endPan, true);

board.addEventListener("contextmenu", e => e.preventDefault());
board.addEventListener("pointerdown", e => {
  if (!room || room.solvedAt) return;
  if (panning || spaceHeld || e.button === 1) return;
  const p = svgPoint(e);

  if (relHeld) {
    // claim about two squares
    const k = cellAt(p.x, p.y);
    if (k < 0) return;
    e.preventDefault();
    board.setPointerCapture(e.pointerId);
    relFrom = k;
    dragMode = "rel";
    relWantSame = e.shiftKey;
    return;
  }

  if (diagHeld) {
    /* A diagonal is drawn corner to corner, not clicked: start near a dot and
       finish near the opposite one. The nearest dot is used, so it does not
       have to be hit exactly. */
    e.preventDefault();
    board.setPointerCapture(e.pointerId);
    ensureCells(room);
    redoStack = [];
    stroke = [];
    dragSeen = new Set();
    dragFrom = p;
    dragLast = p;
    diagStart = vertAt(p.x, p.y);
    dragMode = "diag";
    return;
  }

  const paint = fillWanted(e);

  if (paint) {
    // colour a square
    const k = cellAt(p.x, p.y);
    if (k < 0) return;
    e.preventDefault();
    board.setPointerCapture(e.pointerId);
    ensureCells(room);
    const val = toggleTo(room.cells[k], paint);
    dragMode = "cell";
    dragVal = val;
    dragSeen = new Set([k]);
    stroke = [];
    redoStack = [];
    dragLast = p;
    setCellUser(k, val, true);
    return;
  }

  // Pressing right on a dot is ambiguous — up to four edges are equally close,
  // and picking one at random is what left a stray stub across a sweep. Wait
  // for the drag to say which way it is going instead.
  const v = vertAt(p.x, p.y);
  const onDot = Math.hypot(p.x - (PAD + v.c * CELL), p.y - (PAD + v.r * CELL)) < CELL * 0.22;
  const i = onDot ? -1 : edgeAt(p.x, p.y);
  if (i < 0 && !onDot) return;
  e.preventDefault();
  board.setPointerCapture(e.pointerId);
  dragWant = e.shiftKey || e.button === 2 ? XMARK : LINE;
  dragMode = "edge";
  dragSeen = new Set();
  dragVert = v;
  stroke = [];
  dragVal = null;
  redoStack = [];
  dragLast = p;
  if (i >= 0) {
    dragVal = toggleTo(room.edges[i], dragWant);
    dragSeen.add(i);
    setEdgeUser(i, dragVal, true);
  }
});
/* Pointer events arrive far apart when the mouse moves quickly, so walk the
   straight line between the last position and this one. Without this a fast
   sweep only marks the few segments an event happened to land on. */
function alongDrag(to, fn) {
  const from = dragLast || to;
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (CELL * 0.25)),
  );
  for (let n = 1; n <= steps; n++)
    fn(from.x + ((to.x - from.x) * n) / steps, from.y + ((to.y - from.y) * n) / steps);
  dragLast = to;
}

board.addEventListener("pointermove", e => {
  if (panning) return;
  if (dragMode === null || !room) return;
  const p = svgPoint(e);

  if (dragMode === "diag") {
    dragLast = p;
    return; // decided when the drag ends
  }
  if (dragMode === "cell") {
    alongDrag(p, (x, y) => {
      const k = cellAt(x, y);
      if (k < 0 || dragSeen.has(k)) return;
      dragSeen.add(k);
      setCellUser(k, dragVal, true);
    });
    return;
  }
  alongDrag(p, (x, y) => dragTo(vertAt(x, y)));
});
const endDrag = e => {
  if (dragMode === "diag") {
    const p = e && e.clientX !== undefined ? svgPoint(e) : dragLast;
    const to = p ? vertAt(p.x, p.y) : null;
    const a = diagStart;
    if (a && to && Math.abs(to.r - a.r) === 1 && Math.abs(to.c - a.c) === 1) {
      // the square between the two corners, and which way the stroke leans
      const k = Math.min(a.r, to.r) * engine.C + Math.min(a.c, to.c);
      const slant = (to.r - a.r) * (to.c - a.c) > 0 ? "1" : "2";
      if (k >= 0 && k < engine.NC) {
        const cur = room.diag[k];
        setDiagUser(k, cur === slant ? "0" : slant, false);
      }
    } else if (a && to && a.r === to.r && a.c === to.c) {
      // a tap on a corner clears whichever square you are pointing into
      const c = cellAt(dragFrom.x, dragFrom.y);
      if (c >= 0 && room.diag[c] !== "0") setDiagUser(c, "0", false);
    }
    diagStart = null;
    dragMode = null;
    stroke = null;
    dragLast = null;
    dragFrom = null;
    return;
  }
  if (dragMode === "rel") {
    const p = e && e.clientX !== undefined ? svgPoint(e) : null;
    const to = p ? cellAt(p.x, p.y) : -1;
    if (to >= 0 && to !== relFrom) {
      const key = relKey(relFrom, to);
      const want = relWantSame ? "s" : "d";
      // the same claim twice takes it away, like every other mark
      setRelUser(key, (room.rels[key] || "0") === want ? "0" : want);
    }
    relFrom = -1;
    dragMode = null;
    stroke = null;
    return;
  }
  // a D-click that never moved still leaves a mark, slanting one way by default
  if (dragMode === "diag" && stroke && !stroke.length && dragFrom) {
    const k = cellAt(dragFrom.x, dragFrom.y);
    if (k >= 0) setDiagUser(k, "1", true);
  }
  if (stroke && stroke.length) undoStack.push(stroke);
  dragVal = null;
  dragWant = null;
  dragSeen = null;
  dragMode = null;
  dragVert = null;
  stroke = null;
  dragLast = null;
  dragFrom = null;
};
board.addEventListener("pointerup", endDrag);
board.addEventListener("pointercancel", endDrag);
window.addEventListener("blur", endDrag);

document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  const k = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && k === "z") {
    e.preventDefault();
    e.shiftKey ? doRedo() : doUndo();
  } else if ((e.metaKey || e.ctrlKey) && k === "y") {
    e.preventDefault();
    doRedo();
  }
});

function doUndo() {
  const grp = undoStack.pop();
  if (!grp) return;
  redoStack.push(grp);
  for (let i = grp.length - 1; i >= 0; i--) applyStep(grp[i], grp[i].from);
  render();
}
function doRedo() {
  const grp = redoStack.pop();
  if (!grp) return;
  undoStack.push(grp);
  for (const st of grp) applyStep(st, st.to);
  render();
}
