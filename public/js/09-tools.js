/* ============================================================
   7. Tools
   ============================================================ */
function solutionFor() {
  return satCount(engine, Int8Array.from(room.clues), 1, 200000).solution;
}

document.getElementById("undo").onclick = doUndo;
document.getElementById("redo").onclick = doRedo;

document.getElementById("check").onclick = () => {
  let over = 0;
  for (let k = 0; k < engine.NC; k++) {
    const s = cellSatisfied(k) === 2;
    badEls[k].style.opacity = s ? 1 : 0;
    if (s) over++;
  }
  setTimeout(() => badEls.forEach(b => (b.style.opacity = 0)), 2600);
  const sol = solutionFor();
  if (!sol) {
    toast("Couldn't check this puzzle");
    return;
  }
  ensureCells(room);

  let wrongLines = 0,
    wrongX = 0;
  for (let i = 0; i < engine.E; i++) {
    if (room.edges[i] === "1" && sol[i] !== ON) wrongLines++;
    if (room.edges[i] === "2" && sol[i] === ON) wrongX++; // ruled out a real line
  }

  /* Which side of the true loop each square is on, so the colours can be
     judged too. Flood outwards from beyond the edge, crossing only where the
     solution has no line: everything reached that way is outside. */
  const outside = new Uint8Array(engine.NC);
  {
    const seen = new Uint8Array(engine.NC);
    const stack = [];
    for (let c = 0; c < engine.C; c++) {
      if (sol[engine.H(0, c)] !== ON && !seen[c]) {
        seen[c] = 1;
        stack.push(c);
      }
      const b = (engine.R - 1) * engine.C + c;
      if (sol[engine.H(engine.R, c)] !== ON && !seen[b]) {
        seen[b] = 1;
        stack.push(b);
      }
    }
    for (let r = 0; r < engine.R; r++) {
      const l = r * engine.C,
        rt = r * engine.C + engine.C - 1;
      if (sol[engine.V(r, 0)] !== ON && !seen[l]) {
        seen[l] = 1;
        stack.push(l);
      }
      if (sol[engine.V(r, engine.C)] !== ON && !seen[rt]) {
        seen[rt] = 1;
        stack.push(rt);
      }
    }
    while (stack.length) {
      const k = stack.pop();
      outside[k] = 1;
      const r = (k / engine.C) | 0,
        c = k % engine.C;
      const step = [
        [r - 1, c, engine.H(r, c)],
        [r + 1, c, engine.H(r + 1, c)],
        [r, c - 1, engine.V(r, c)],
        [r, c + 1, engine.V(r, c + 1)],
      ];
      for (const [nr, nc, e] of step) {
        if (nr < 0 || nc < 0 || nr >= engine.R || nc >= engine.C) continue;
        const n = nr * engine.C + nc;
        if (seen[n] || sol[e] === ON) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  // blue and yellow are opposite sides; whichever way round, they must agree
  let blueOut = 0,
    blueIn = 0,
    wrongColour = 0;
  for (let k = 0; k < engine.NC; k++) {
    if (room.cells[k] === "1") outside[k] ? blueOut++ : blueIn++;
  }
  const blueMeansOutside = blueOut >= blueIn;
  for (let k = 0; k < engine.NC; k++) {
    const m = room.cells[k];
    if (m === "0") continue;
    const isOut = !!outside[k];
    const ok = m === "1" ? isOut === blueMeansOutside : isOut !== blueMeansOutside;
    if (!ok) {
      wrongColour++;
      badEls[k].style.opacity = 1;
    }
  }

  const parts = [];
  if (wrongLines)
    parts.push(`${wrongLines} segment${wrongLines === 1 ? "" : "s"} in the wrong place`);
  if (wrongX) parts.push(`${wrongX} × where a line belongs`);
  if (wrongColour)
    parts.push(`${wrongColour} square${wrongColour === 1 ? "" : "s"} coloured the wrong side`);
  if (!parts.length && over)
    parts.push(`${over} clue${over === 1 ? "" : "s"} already has too many lines`);
  toast(parts.length ? parts.join(" · ") : "Everything drawn so far is right");
};

document.getElementById("zoomIn").onclick = () =>
  zoomAt(view.x + view.w / 2, view.y + view.h / 2, 1.3);
document.getElementById("zoomOut").onclick = () =>
  zoomAt(view.x + view.w / 2, view.y + view.h / 2, 1 / 1.3);
document.getElementById("zoomReset").onclick = resetView;

function download(name, text, type) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([text], { type: type || "application/json" }));
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* the puzzle and everything drawn on it, in the same shape the importer reads */
/* While a branch is open the sheet itself lives in trunk.saved, so export
   that rather than whatever the branch happens to be showing. */
function sheetProgress() {
  const b = trial ? trunk.saved || boardSnapshot() : boardSnapshot();
  return { edges: b.edges, cells: b.cells, diag: b.diag };
}
function exportTree() {
  ensureTree(room);
  const out = {};
  for (const id in room.tree) {
    const r = room.tree[id];
    if (r && !r.dead) out[id] = r;
  }
  return out;
}

let loadedFrom = null; // {name, handle} of the file this sheet came from

document.getElementById("exportBtn").onclick = async () => {
  if (!room) return;
  ensureCells(room);
  const save = {
    format: "slitherlink-pack",
    version: 1,
    generator: "plot room export",
    created: new Date().toISOString(),
    puzzles: [
      {
        R: room.R,
        C: room.C,
        diff: room.diff,
        given: room.given,
        minimal: !!room.minimal,
        clues: Array.from(room.clues),
        // the sheet as it stands, plus every branch hanging off it
        progress: {
          ...sheetProgress(),
          solvedAt: room.solvedAt || 0,
          tree: exportTree(),
          active: trial ? trial.id : null,
        },
      },
    ],
  };
  const text = JSON.stringify(save);

  /* If this sheet was opened from a file, offer to write back over it rather
     than leaving a second copy in the downloads folder. Writing in place needs
     the file picker API, so fall back to a normal download elsewhere. */
  if (loadedFrom && loadedFrom.handle) {
    const update = confirm(
      `Update ${loadedFrom.name} with the current puzzle and progress?\n\n` +
        `OK replaces that file. Cancel saves a separate copy.`,
    );
    if (update) {
      try {
        const w = await loadedFrom.handle.createWritable();
        await w.write(text);
        await w.close();
        toast("Updated " + loadedFrom.name);
        return;
      } catch (e) {
        toast("Couldn't write to that file — saving a copy instead");
      }
    }
  } else if (loadedFrom) {
    const same = confirm(
      `Save over ${loadedFrom.name}?\n\n` +
        `This browser can't replace a file directly, so it will be saved with ` +
        `the same name and you can overwrite when asked. Cancel to use a new name.`,
    );
    if (same) {
      download(loadedFrom.name, text);
      toast("Saved as " + loadedFrom.name);
      return;
    }
  }
  download(`slitherlink-${room.code || "puzzle"}.json`, text);
  toast("Exported puzzle and progress");
};

document.getElementById("clearlines").onclick = () => {
  ensureCells(room);
  let n = 0,
    d = 0;
  for (let i = 0; i < engine.E; i++)
    if (room.edges[i] === "1") {
      queueOp(i, "0");
      n++;
    }
  // diagonals are drawn lines too, so clearing lines takes them with it
  for (let k = 0; k < engine.NC; k++)
    if (room.diag[k] !== "0") {
      queueDiag(k, "0");
      d++;
    }
  render();
  toast(
    n || d
      ? `Cleared ${n} line${n === 1 ? "" : "s"}` +
          (d ? ` and ${d} diagonal${d === 1 ? "" : "s"}` : "")
      : "Nothing drawn to clear",
  );
};

document.getElementById("clearx").onclick = () => {
  for (let i = 0; i < engine.E; i++) if (room.edges[i] === "2") queueOp(i, "0");
  render();
  toast("X marks cleared");
};

document.getElementById("clearfill").onclick = () => {
  ensureCells(room);
  let n = 0;
  for (let k = 0; k < engine.NC; k++)
    if (room.cells[k] !== "0") {
      queueCell(k, "0");
      n++;
    }
  render();
  toast(n ? "Colors cleared" : "No colored squares to clear");
};

document.getElementById("optDim").onchange = e => {
  dimClues = e.target.checked;
  render();
};
document.getElementById("optPremise").onchange = e => {
  showPremises = e.target.checked;
  render();
};
document.getElementById("optWeight").onchange = e => {
  weighted = e.target.checked;
  document.body.classList.toggle("weighted", weighted);
  render();
};

document.getElementById("newsheet").onclick = () => {
  if (!isOwner()) {
    toast("Only " + ownerLabel() + " can change this puzzle");
    return;
  }
  /* Only worth asking when the answer matters to somebody else. Alone in a
     puzzle, the confirmation is a question with one sensible answer. */
  const others = (room.players || []).filter(p => p.id !== me.id && now() - p.seen < IDLE_MS);
  if (
    others.length &&
    !confirm("Load a new puzzle for everyone in this room? The current one is cleared.")
  )
    return;
  clearBranches();
  openSetup(true);
};
document.getElementById("roomcode").onclick = e => {
  e.preventDefault();
  document.getElementById("copycode").click();
};

document.getElementById("copycode").onclick = async () => {
  const link = roomLink(room.code);
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copied — send it to whoever is joining");
  } catch (e) {
    toast(link);
  }
};
document.getElementById("leaveroom").onclick = () => {
  try {
    const u = new URL(location.href);
    u.searchParams.delete("room");
    history.replaceState(null, "", u.toString());
  } catch (e) {}
  clearBranches();
  clearInterval(pollTimer);
  clearInterval(indexTimer);
  room = null;
  document.getElementById("roomchip").hidden = true;
  openSetup(false);
};

let toastTimer = null;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
}

/* Changing your name or colour, from the player list. Both take effect
   everywhere as soon as the next sync goes out. */
(function wireIdentity() {
  const btn = document.getElementById("meEdit");
  if (!btn) return;

  const open = () => {
    if (!room) return;
    const asked = prompt("Your name in this puzzle", me.name || "");
    if (asked !== null && asked.trim()) setMyName(asked);
    pickPen();
  };

  function pickPen() {
    const box = document.getElementById("penPick");
    if (box) {
      box.remove();
      return;
    }
    const wrap = document.createElement("div");
    wrap.id = "penPick";
    wrap.className = "penpick";
    PENS.forEach((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "penpick__dot";
      b.style.background = `var(${PENS[i]})`;
      b.title = "use this colour";
      b.onclick = () => {
        setMyPen(i);
        wrap.remove();
      };
      wrap.appendChild(b);
    });
    btn.after(wrap);
  }

  btn.onclick = open;
})();
