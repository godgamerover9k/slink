/* ============================================================
   9. Boot
   ============================================================ */
/* The branch list gets its own column when there is room for one, and rejoins
   the side panel when there isn't. Same element either way, so nothing about
   it needs to know where it lives. */
function placeBranchPanel() {
  const block = document.getElementById("trialBlock");
  const col = document.getElementById("branchcol");
  const panel = document.querySelector(".panel");
  if (!block || !col || !panel) return;
  const wide = window.innerWidth > 1320; // matches the css breakpoint
  col.hidden = !wide;
  if (wide && block.parentElement !== col) col.appendChild(block);
  if (!wide && block.parentElement !== panel)
    panel.insertBefore(block, panel.children[2] || null);
}
window.addEventListener("resize", placeBranchPanel);

(async function boot() {
  setDims(10, 10);
  buildChips();
  const saved = await store.get(ME_KEY, false);
  if (saved) {
    try {
      me = JSON.parse(saved.value);
    } catch (e) {}
  }
  if (!me || !me.id) me = { id: uid(), name: "" };
  document.getElementById("nameIn").value = me.name || "";
  placeBranchPanel();
  await store.probe();
  const linkRoom = (() => {
    try {
      return new URL(location.href).searchParams.get("room") || "";
    } catch (e) {
      return "";
    }
  })();
  offerExe();
  wireServerBox();
  soloNotice();
  // a link to a puzzle wins over whatever you were last looking at
  if (linkRoom && store.ok) {
    /* Following a link goes straight into the puzzle, so the one chance to say
       who you are has gone by. Offer it, unless a name is already set. */
    const named = !!(me && me.name && me.name !== "Anon");
    document.getElementById("codeIn").value = linkRoom;
    if (await joinRoom(linkRoom)) {
      if (!named) {
        /* Asking must never cost someone the puzzle they just opened: some
           browsers refuse prompt outright, and an exception here would abort
           the join that has already succeeded. */
        try {
          const asked = prompt("You are in. What should the others call you?", me.name || "");
          if (asked !== null && asked.trim()) setMyName(asked);
        } catch (e) {}
      }
      return;
    }
    // it did not open. openSetup resets the tab and clears the message, so
    // put both back afterwards rather than before.
    const why = errEl.textContent;
    openSetup(false);
    switchTab(false);
    document.getElementById("codeIn").value = linkRoom;
    errEl.textContent = why || "That puzzle isn't there any more.";
    return;
  }
  await resumeLast();
  openSetup(false);
  if (matchMedia("(pointer:fine)").matches) document.getElementById("nameIn").focus();
})();

setInterval(() => {
  if (room && !trial) rememberLast();
}, 5000);
window.addEventListener("beforeunload", () => {
  if (pending.length) flush();
  rememberLast();
});
