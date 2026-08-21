# Tests

These open the real page in a headless browser and check what it does, rather
than what it is meant to do. Most exist because something got through once.

## Running them

    npm install                      # jsdom, needed only for the tests
    npm test                         # everything that does not need a port
    node tests/branches.js           # one file

`npm test` runs four at a time — around three minutes for the lot. Each test
builds its own page and talks to nobody else, so they do not need to wait in
line.

Run them from the repository root. In the browser the program is a set of ES
modules; jsdom cannot run those, so `pageload.js` strips the imports and
exports and stitches the files into one script, in the order `main.js` lists
them. The page itself is left as modules — only the tests see the stitched
version.

The suites that start a server bind a port, so two of them cannot run at once.
`npm test` leaves them out; run those one at a time:

    node tests/server-basics.js
    node tests/server-with-key.js
    node tests/page-and-rooms-apart.js
    node tests/puzzle-links.js
    node tests/generator-page.js
    node tests/generator-download-link.js
    node tests/importing-packs.js some-pack.json
    node tests/generating-progress.js

## What covers what

Named so a failure says what broke without opening the file.

### Drawing

| file | covers |
|---|---|
| `drawing-basics.js` | lines, ×s, colours, dragging, undo |
| `drawing-features.js` | diagonals, zoom, branch inheritance, export |
| `cell-fills.js` | filling squares and the shapes that come out |
| `mark-colours.js` | every mark in the pen of whoever made it |
| `restored-line-colours.js` | lines from an imported file keeping an owner |
| `playing-alone.js` | plain graphite when nobody else is here |
| `zoom-and-pan.js` | clicks landing correctly when zoomed |

### Branches

| file | covers |
|---|---|
| `branches.js` | premises, nesting, contradictions, discarding |
| `branch-list.js` | what the list shows as you move around it |
| `branch-premise.js` | what may be assumed, and when it can be taken back |
| `branch-authority.js` | a branch adds to its parent, never overrules it |
| `branch-accept.js` | accepting a branch onto its parent |
| `branch-opposite.js` | trying the other half of a guess |
| `branch-chaining.js` | carrying straight on after settling one |
| `branch-order.js` | branches staying put when renamed or drawn on |
| `branch-reordering.js` | dragging them into a different order |
| `branch-inheritance.js` | a change on the master reaching branches below |
| `branch-disagreement.js` | a branch left out of step by a later change |
| `branch-list-growth.js` | the list growing rather than scrolling |
| `branch-column-layout.js` | the column appearing and folding away |
| `contradiction-location.js` | saying *where* something is broken |

### Two people at once

| file | covers |
|---|---|
| `two-players.js` | two people on one puzzle, branches syncing |
| `two-people-one-branch.js` | both editing one branch, nobody losing work |
| `reorder-while-editing.js` | a reorder and an edit at the same moment |
| `clock-skew.js` | machines whose clocks disagree |
| `pens-across-screens.js` | pen colours agreeing on every screen |
| `puzzle-owner.js` | only whoever opened a puzzle can replace it |
| `name-and-colour.js` | changing your name and pen |

### The page

| file | covers |
|---|---|
| `hello-screen.js` | the opening screen and the way back |
| `offline-puzzles.js` | a puzzle that never leaves the browser |
| `check-puzzle.js` | checking the puzzle, not your current branch |
| `solving-by-colour.js` | finishing with colours and no lines drawn |
| `absent-lines-mode.js` | the absent-lines view and the parity checks |
| `absent-lines-switching.js` | nothing flashing when it is switched off |
| `hiding-the-controls.js` | folding the controls away |
| `tools-and-diagonals.js` | clear-lines, diagonals as drags, naming |
| `saving-files.js` | export, and saving back over a file you opened |
| `export-with-branches.js` | export carrying every branch |
| `canonical-links.js` | links naming the right address |
| `keyboard.js` | arrow keys in the list and on the board |
| `credits.js`, `small-things.js` | credits, the player list, odds and ends |

### Underneath

| file | covers |
|---|---|
| `sat-solver.js` | the SAT solver agreeing with the older search |
| `verify-pack-is-unique.js` | a generated pack really has one solution |
| `generating-progress.js` | what the progress bar reports while building |
| `generator-page.js` | the generator's own page |
| `generator-download-link.js` | offering the binary when one is published |
| `server-basics.js`, `server-with-key.js` | the room server, open and keyed |
| `page-and-rooms-apart.js` | page on one host, rooms on another |
| `importing-packs.js` | reading a pack file |

## Writing another

Copy the top of `playing-alone.js` — it is the shortest. A test builds a page,
drives it through the same buttons a person would press, and compares what
happened against what should have. Reach into internals (`room`, `engine`,
`trial`) to set up a situation, but check the result the way a player sees it.
