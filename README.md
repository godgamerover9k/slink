# WeSLink

Slitherlink, drawn together. One puzzle, one board, everybody's pens at once.

Live at **weslither.link**.

## What is here

    public/          everything the browser gets
      index.html       the page
      styles.css       the look
      js/              one file per part of the program, loaded in order
      download/        the offline generator, offered on the hello screen
    server/
      slink-server.js  serves public/ and keeps the shared puzzles
    tests/           drives the real page and checks what it does
    render.yaml      how the host runs it
    package.json     npm start, npm test

## Working on it

    npm start          # serves public/ on localhost:8080
    npm test           # the whole suite

`npm start` prints an address for this computer and one for each network
interface, so a second device can join a puzzle while you are working.

Pushing to the repository deploys it.

## How it fits together

**It is a set of ES modules.** `public/js/main.js` names them in the order they
have always loaded, and each file says what it needs from the others. Two
things follow from a dozen files importing each other both ways: anything a
file *does* on the way past — wiring a button, listening for a key — waits in
a `queueMicrotask` until the whole program is loaded, and a value one file owns
is set by others through a `setX` function, because what you import is
read-only.

**The page is the program.** All the thinking — the grid, the solver, the SAT
solver, the generator, the branch tree — runs in the browser. Nothing is
computed on the server.

**The server is a noticeboard.** It serves the files and keeps a key/value
store at `/kv/`. It knows nothing about Slitherlink: a puzzle is a blob of JSON
under `sl:room:CODE`, and the page does all the merging. That is why the same
page works offline, from a file, or against any host that answers those routes.

**Shared editing merges, it does not overwrite.** Every edge carries the time
it was marked; every branch mark carries its own time and who made it. Two
people drawing at once keep both marks. This is worth knowing before changing
anything in `05-room-state.js` or `08-branches.js` — the tests in
`two-people-one-branch.js` and `reorder-while-editing.js` exist because both were got wrong once.

**A branch only ever adds.** It stores the differences from the branch above
it and can never rub out or change what its parent decided. Everything below
inherits from above automatically.

### The scripts, in load order

| file | what lives there |
|---|---|
| `01-engine.js` | the grid: edges, dots, cells and how they relate |
| `02-solver.js` | the hand-written search, used for hints and checks |
| `03-sat.js` | a small CDCL SAT solver, and Slitherlink written as CNF |
| `04-generator.js` | making a puzzle and trimming it to one solution |
| `05-room-state.js` | shared state, syncing, and the storage under it |
| `06-board.js` | drawing the board |
| `07-input.js` | clicks, drags and keys |
| `08-branches.js` | the branch tree |
| `09-tools.js` | the tools panel |
| `10-setup.js` | the hello screen: new puzzle, join, import |
| `11-boot.js` | starting everything up |

## Settings

The server reads `PORT`, `SLINK_KEY`, `SLINK_OPEN`, `SLINK_PAGE`, `SLINK_DATA`,
`SLINK_HOST`, `SLINK_MAX_ROOMS` and `SLINK_MAX_VALUE`, and takes the same
things as flags. `node server/slink-server.js --help` explains each.

It is open by default: anyone with the address can make a puzzle and join one.
Setting `SLINK_KEY` makes it private, and links then need `?k=` on the end.

Puzzles are held in memory and written to `slink-rooms.json`, which the host
wipes on every deploy. That is fine — a puzzle on the server is a meeting
point. Each player's own progress lives in their browser, and **Export puzzle +
progress** writes a puzzle and all of its branches to a file.

## Big binaries

The Windows and macOS builds of the generator are not in this repository: they
are 55MB each and every committed version stays in the history for good. Put
one in `public/download/` on the deployed site if the page should offer it.
`slink-gen.js` is small and is included, so anyone with Node can use it.
