import { ME_KEY, flush, me, pending, room, setMe, store, trial, uid } from "./05-room-state.js";
import { setMyName } from "./06-board.js";
import { HOME, buildChips, errEl, joinRoom, offerExe, offerLast, openSetup, rememberLast, setDims, soloNotice, switchTab, wireServerBox } from "./10-setup.js";

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


/* Anyone arriving at the old address is sent to the new one, keeping whatever
   puzzle or key was on the link. Kept separate from the act of going there so
   the decision can be checked without a browser navigating. */
function homeRedirectTarget(here) {
  try {
    const at = new URL(here || location.href);
    if (!/(^|\.)onrender\.com$/i.test(at.hostname)) return null;
    return new URL(at.pathname + at.search + at.hash, HOME).toString();
  } catch (e) {
    return null;
  }
}









/* Run once the whole program is loaded, so nothing here reaches for a
   part that has not been set up yet. */
queueMicrotask(() => {
  window.addEventListener("resize", placeBranchPanel);
  (function moveToHome() {
    const to = homeRedirectTarget();
    if (to) location.replace(to);
  })();
  (async function boot() {
    setDims(10, 10);
    buildChips();
    const saved = await store.get(ME_KEY, false);
    if (saved) {
      try {
        setMe(JSON.parse(saved.value));
      } catch (e) {}
    }
    if (!me || !me.id) setMe({ id: uid(), name: "" });
    document.getElementById("nameIn").value = me.name || "";
    placeBranchPanel();
    // the download link has nothing to do with the room server, so it should not
    // wait behind a probe that retries before giving up
    offerExe();
    await store.probe();
    const linkRoom = (() => {
      try {
        return new URL(location.href).searchParams.get("room") || "";
      } catch (e) {
        return "";
      }
    })();
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
    /* Opening the site plainly should show the hello screen, not drop you back
       into whatever you were last doing. The way back is offered there. */
    openSetup(false);
    await offerLast();
    if (matchMedia("(pointer:fine)").matches) document.getElementById("nameIn").focus();
  })();
  setInterval(() => {
    if (room && !trial) rememberLast();
  }, 5000);
  window.addEventListener("beforeunload", () => {
    if (pending.length) flush();
    rememberLast();
  });
});

/* what other parts of the program use from here */
export {
  homeRedirectTarget,
  placeBranchPanel,
};
