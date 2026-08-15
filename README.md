# Slitherlink Plot Room

One puzzle, one board, everybody's pens at once.

    public/          everything the browser gets
      index.html       the page
      styles.css       the look
      js/              one file per part of the program, loaded in order
      download/        the offline generator, offered on the setup card
    server/
      slink-server.js  serves public/ and keeps the shared rooms
    tests/           drives the real page and checks what it does
    render.yaml      how Render runs it
    package.json     npm start, npm test

## Putting it online (Render, free)

1. Push this repository to GitHub.
2. On Render choose **New → Blueprint** and pick the repository.
3. Open the address it gives you.

That address is the whole thing. Anyone you send it to can start a puzzle or
join one: whoever starts reads out the four-letter code, or sends the link from
**Copy link**.

**The first visit after a quiet spell is slow** — the free plan stops the
service when it is idle, so the first person waits up to a minute.

**The server forgets rooms when it restarts.** That is fine for what it is: a
meeting point. Each player's own progress lives in their browser, and **Export
puzzle + progress** writes a puzzle and all of its branches to a file.

### Making it private

Delete `SLINK_OPEN` from `render.yaml` and set `SLINK_KEY` to a phrase of your
own. The address then only works with `?k=your-phrase` on the end.

## Running it at home

    npm start

It prints an address for this computer and one for each network interface. To
reach it from further away without deploying anything, tunnel it:

    cloudflared tunnel --url http://localhost:8080

## Tests

    npm install     # jsdom, needed only for the tests
    npm test

They open the real page in a headless browser and check what it does. The page
is split across several files in the browser, so `tests/pageload.js` stitches
them back into one document first.

## The scripts, in load order

| file | what lives there |
|---|---|
| `01-engine.js` | the grid: edges, dots, cells and how they relate |
| `02-solver.js` | the hand-written search, used for hints and checks |
| `03-sat.js` | a small CDCL SAT solver, and Slitherlink written as CNF |
| `04-generator.js` | making a puzzle and trimming it to one solution |
| `05-room-state.js` | shared state, syncing, and the storage it sits on |
| `06-board.js` | drawing the board |
| `07-input.js` | clicks, drags and keys |
| `08-branches.js` | the branch tree |
| `09-tools.js` | the tools panel |
| `10-setup.js` | the opening card: new puzzle, join, import |
| `11-boot.js` | starting everything up |

## Big binaries

The Windows and macOS builds of the generator are **not** in this repository.
They are 55MB each, and every version committed stays in the history for good.
Attach them to a GitHub Release instead, or drop one into `public/download/`
on the deployed site if you want the page to offer it. `slink-gen.js` is small
and is included, so anyone with Node can use it.
