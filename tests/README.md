# Tests

These open the real page in a headless browser and check what it does, rather
than what it is meant to do. Most exist because something got through once.

## Running them

    npm install        # jsdom, needed only for the tests
    npm test           # everything
    node tests/test.js # one file

Run them from the repository root. In the browser the page arrives as
`index.html` plus a stylesheet plus a folder of scripts; `pageload.js` stitches
those back into one document so a test sees exactly what a browser sees.

Suites that bind a port (`test-server`, `test-public`, `test-split`,
`test-render`, `test-onezip`, `linktest`) are left out of `npm test` and run
one at a time, because two of them cannot hold the same port at once.

## What covers what

| file | covers |
|---|---|
| `test.js` | drawing: lines, ×s, colours, dragging, undo |
| `test-branch.js` | branches: premises, nesting, contradictions, discarding |
| `test-share.js` | two players on one puzzle, branches syncing between them |
| `inherit.js` | a change on the master reaching the branches below it |
| `accepttest.js` | accepting a branch onto its parent |
| `ordertest.js` | branches staying put when renamed or drawn on |
| `treetest.js` | collapsing offshoots, and premises already settled above |
| `dragtest.js` | reordering branches by dragging |
| `ownertest.js` | only whoever opened a puzzle can replace it |
| `identitytest.js` | changing your name and pen colour |
| `pentest.js` | pen colours agreeing on every screen |
| `solotest.js` | plain graphite when you are the only one here |
| `modetest.js` | the absent-lines view, and the parity checks |
| `colorsolve.js` | finishing a puzzle by colouring, with no lines drawn |
| `fixtest.js` | clear-lines, diagonals as drags, naming, checking |
| `linktest.js` | shareable links and the address bar |
| `savetest.js` | export, and saving back over a file you opened |
| `exportcheck.js` | export carrying every branch |
| `test-view.js` | zoom, pan, and clicks landing right when zoomed |
| `coltest.js` | the branch column appearing and folding away |
| `hidetest.js` | hiding the controls; colours in the absent-lines view |
| `credittest.js`, `misctest.js` | credits, the player list, small things |
| `test-sat.js` | the SAT solver agreeing with the older search |
| `test-server.js`, `test-public.js`, `test-split.js` | the room server |
| `test-render.js`, `test-onezip.js` | this repository, deployed as it stands |
| `verify_sat.js` | check a generated pack really has one solution |

`verify_sat.js` takes a pack file:

    node tests/verify_sat.js some-pack.json

## Writing another

Copy the top of `solotest.js` — it is the shortest. A test builds a page,
drives it through the same buttons a person would press, and compares what
happened against what should have. Reach into internals (`room`, `engine`,
`trial`) when that is the clearest way to set up a situation, but check the
result the way a player would see it.
