/* ============================================================
   7. Tools
   ============================================================ */
function solutionFor() {
  return satCount(engine, Int8Array.from(room.clues), 1, 200000).solution;
}

document.getElementById("undo").onclick = doUndo;
document.getElementById("redo").onclick = doRedo;

document.getElementById("check").onclick = () => {
  /* Checking is about the puzzle, not about whichever branch you happen to be
     inside. A branch is a guess; being told a guess is wrong tells you
     nothing you did not already accept when you made it. */
  const onBranch = !!trial;
  const wasOn = onBranch ? trial.id : null;
  if (onBranch) switchBranch(null);

  let over = 0;
  for (let cell = 0; cell < engine.NC; cell++) {
    const text = cellSatisfied(cell) === 2;
    badEls[cell].style.opacity = text ? 1 : 0;
    if (text) over++;
  }
  setTimeout(() => badEls.forEach(btn => (btn.style.opacity = 0)), 2600);
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
      const btn = (engine.R - 1) * engine.C + c;
      if (sol[engine.H(engine.R, c)] !== ON && !seen[btn]) {
        seen[btn] = 1;
        stack.push(btn);
      }
    }
    for (let r = 0; r < engine.R; r++) {
      const line = r * engine.C,
        rt = r * engine.C + engine.C - 1;
      if (sol[engine.V(r, 0)] !== ON && !seen[line]) {
        seen[line] = 1;
        stack.push(line);
      }
      if (sol[engine.V(r, engine.C)] !== ON && !seen[rt]) {
        seen[rt] = 1;
        stack.push(rt);
      }
    }
    while (stack.length) {
      const cell = stack.pop();
      outside[cell] = 1;
      const r = (cell / engine.C) | 0,
        c = cell % engine.C;
      const step = [
        [r - 1, c, engine.H(r, c)],
        [r + 1, c, engine.H(r + 1, c)],
        [r, c - 1, engine.V(r, c)],
        [r, c + 1, engine.V(r, c + 1)],
      ];
      for (const [nr, nc, edge] of step) {
        if (nr < 0 || nc < 0 || nr >= engine.R || nc >= engine.C) continue;
        const node = nr * engine.C + nc;
        if (seen[node] || sol[edge] === ON) continue;
        seen[node] = 1;
        stack.push(node);
      }
    }
  }
  // blue and yellow are opposite sides; whichever way round, they must agree
  let blueOut = 0,
    blueIn = 0,
    wrongColour = 0;
  for (let cell = 0; cell < engine.NC; cell++) {
    if (room.cells[cell] === "1") outside[cell] ? blueOut++ : blueIn++;
  }
  const blueMeansOutside = blueOut >= blueIn;
  for (let cell = 0; cell < engine.NC; cell++) {
    const msg = room.cells[cell];
    if (msg === "0") continue;
    const isOut = !!outside[cell];
    const ok = msg === "1" ? isOut === blueMeansOutside : isOut !== blueMeansOutside;
    if (!ok) {
      wrongColour++;
      badEls[cell].style.opacity = 1;
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
  toast(
    (onBranch ? "On the puzzle: " : "") +
      (parts.length ? parts.join(" · ") : "Everything drawn so far is right"),
  );
  if (onBranch) switchBranch(wasOn);
};

document.getElementById("zoomIn").onclick = () =>
  zoomAt(view.x + view.w / 2, view.y + view.h / 2, 1.3);
document.getElementById("zoomOut").onclick = () =>
  zoomAt(view.x + view.w / 2, view.y + view.h / 2, 1 / 1.3);
document.getElementById("zoomReset").onclick = resetView;

function download(name, text, type) {
  const anchor = document.createElement("a");
  const url = URL.createObjectURL(new Blob([text], { type: type || "application/json" }));
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* the puzzle and everything drawn on it, in the same shape the importer reads */
/* While a branch is open the sheet itself lives in trunk.saved, so export
   that rather than whatever the branch happens to be showing. */
function sheetProgress() {
  const btn = trial ? trunk.saved || boardSnapshot() : boardSnapshot();
  return { edges: btn.edges, cells: btn.cells, diag: btn.diag };
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
        // the master as it stands, plus every branch hanging off it
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
        const writer = await loadedFrom.handle.createWritable();
        await writer.write(text);
        await writer.close();
        toast("Updated " + loadedFrom.name);
        return;
      } catch (edge) {
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
  let node = 0,
    dl = 0;
  for (let i = 0; i < engine.E; i++)
    if (room.edges[i] === "1") {
      queueOp(i, "0");
      node++;
    }
  // diagonals are drawn lines too, so clearing lines takes them with it
  for (let cell = 0; cell < engine.NC; cell++)
    if (room.diag[cell] !== "0") {
      queueDiag(cell, "0");
      dl++;
    }
  render();
  toast(
    node || dl
      ? `Cleared ${node} line${node === 1 ? "" : "s"}` +
          (dl ? ` and ${dl} diagonal${dl === 1 ? "" : "s"}` : "")
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
  let node = 0;
  for (let cell = 0; cell < engine.NC; cell++)
    if (room.cells[cell] !== "0") {
      queueCell(cell, "0");
      node++;
    }
  render();
  toast(node ? "Colors cleared" : "No colored squares to clear");
};

document.getElementById("optDim").onchange = edge => {
  dimClues = edge.target.checked;
  render();
};
document.getElementById("optPremise").onchange = edge => {
  showPremises = edge.target.checked;
  render();
};
document.getElementById("optWeight").onchange = ev => {
  weighted = ev.target.checked;
  /* Nothing should fade while the whole board changes meaning: the crossfade
     showed every undecided line for a tenth of a second. */
  document.body.classList.add("noFade");
  document.body.classList.toggle("weighted", weighted);
  render();
  setTimeout(() => document.body.classList.remove("noFade"), 60);
};

document.getElementById("newsheet").onclick = () => {
  if (!isOwner()) {
    toast("Only " + ownerLabel() + " can change this puzzle");
    return;
  }
  /* Only worth asking when the answer matters to somebody else. Alone in a
     puzzle, the confirmation is a question with one sensible answer. */
  const others = (room.players || []).filter(player => player.id !== me.id && now() - player.seen < IDLE_MS);
  if (
    others.length &&
    !confirm("Load a new puzzle for everyone in this room? The current one is cleared.")
  )
    return;
  clearBranches();
  openSetup(true);
};
document.getElementById("roomcode").onclick = edge => {
  edge.preventDefault();
  document.getElementById("copycode").click();
};

document.getElementById("copycode").onclick = async () => {
  const link = roomLink(room.code);
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copied — send it to whoever is joining");
  } catch (edge) {
    toast(link);
  }
};
document.getElementById("leaveroom").onclick = () => {
  try {
    const url = new URL(location.href);
    url.searchParams.delete("room");
    history.replaceState(null, "", url.toString());
  } catch (edge) {}
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

/* Changing your name or colour. Both are reached by clicking the thing they
   change, in the player list. */
function editMyName() {
  if (!room) return;
  try {
    const asked = prompt("Your name in this puzzle", me.name || "");
    if (asked !== null && asked.trim()) setMyName(asked);
  } catch (e) {}
}

function choosePen(near) {
  const open = document.getElementById("penPick");
  if (open) {
    open.remove();
    return;
  }
  const wrap = document.createElement("div");
  wrap.id = "penPick";
  wrap.className = "penpick";
  PENS.forEach((_, slot) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "penpick__dot";
    dot.style.background = `var(${PENS[slot]})`;
    dot.title = "use this colour";
    dot.onclick = () => {
      setMyPen(slot);
      wrap.remove();
    };
    wrap.appendChild(dot);
  });
  (near.closest(".pen") || near).after(wrap);
}

/* Carry on with another branch after settling one. Remembered per browser,
   since it is a way of working rather than something about the puzzle. */
(function wireChain() {
  const box = document.getElementById("optChain");
  if (!box) return;
  try {
    chainBranches = window.localStorage.getItem("sl:chain") === "1";
  } catch (e) {}
  box.checked = chainBranches;
  box.onchange = () => {
    chainBranches = box.checked;
    try {
      window.localStorage.setItem("sl:chain", chainBranches ? "1" : "0");
    } catch (e) {}
  };
})();

/* Rebinding the held keys. Click the key, press another. */
(function wireKeys() {
  const box = document.getElementById("keyBinds");
  if (!box) return;
  const LABELS = { diagonal: "Diagonal", claim: "Claim" };
  let listening = null;

  function draw() {
    box.innerHTML = "";
    for (const action in LABELS) {
      const row = document.createElement("div");
      row.className = "keys__row";
      const name = document.createElement("span");
      name.textContent = LABELS[action];
      const key = document.createElement("button");
      key.className = "keys__key";
      key.textContent = listening === action ? "press a key" : keyBinds[action].toUpperCase();
      key.onclick = () => {
        listening = listening === action ? null : action;
        draw();
      };
      row.append(name, key);
      box.appendChild(row);
    }
  }

  window.addEventListener(
    "keydown",
    ev => {
      if (!listening) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === "Escape") {
        listening = null;
      } else if (setKeyBind(listening, ev.key)) {
        listening = null;
      } else {
        toast("That key is taken, or cannot be used");
      }
      draw();
    },
    true,
  );

  draw();
})();
