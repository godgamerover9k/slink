# Tests

Everything here drives the real page in a headless browser (jsdom) and checks
what it actually does, rather than what it is supposed to do. Several of these
exist because a bug got through once.

## Running them

    npm install jsdom          # the only dependency, and only for the tests
    node tests/test.js         # any single file
    node tests/run-all.js      # everything

They expect to be run from the repository root, because they read `index.html`
from there.

## What is where

| file | covers |
|---|---|
| `test.js` | drawing: lines, ×s, colours, dragging, undo |
| `test-branch.js` | branches: premises, nesting, contradictions, discarding |
| `test-share.js` | two players on one puzzle, branches syncing between them |
| `inherit.js` | a change on the master reaching the branches below it |
| `accepttest.js` | accepting a branch onto its parent |
| `ownertest.js` | only the person who opened a puzzle can replace it |
| `pentest.js` | pen colours agreeing on every screen |
| `modetest.js` | the absent-lines view and the parity checks |
| `fixtest.js` | clear-lines, diagonals as drags, branch naming, checking |
| `linktest.js` | shareable links, and the address bar |
| `savetest.js` | export, and saving back over a loaded file |
| `exportcheck.js` | export carrying every branch |
| `dragtest.js` | reordering branches |
| `test-view.js` | zoom, pan, and clicks landing correctly when zoomed |
| `test-sat.js` | the SAT solver agreeing with the older search |
| `test-server.js`, `test-public.js`, `test-split.js` | the room server |
| `test-render.js`, `test-onezip.js` | this repository deployed as-is |
| `verify_sat.js`, `verify-pack.js` | check a generated pack really is unique |

`verify-pack.js` and a few others take a pack file as an argument:

    node tests/verify-pack.js some-pack.json
