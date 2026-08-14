# Slitherlink Plot Room

One puzzle, one sheet, everybody's pens at once. This repository holds both
halves: the page people play on, and the small server that lets them share a
sheet.

    index.html        the whole app — one file, no build step
    slink-server.js   serves that page and keeps the rooms
    render.yaml       tells Render how to run it
    package.json      npm start
    vercel.json       only matters if you also host the page on Vercel

## Putting it online (Render, free)

1. Push this repository to GitHub.
2. On Render choose **New → Blueprint** and pick the repository. It reads
   `render.yaml` and creates a free web service.
3. Open the address it gives you, for example
   `https://slitherlink-plot-room.onrender.com/`.

That address is the whole thing. Anyone you send it to can start a sheet or
join one: whoever starts reads out the four-letter code from the top right,
and the others put it into **Join a sheet**.

### Two things to expect

**The first visit after a quiet spell is slow.** Render's free plan stops the
service when nobody is using it, so the first person waits up to a minute
while it wakes. After that it stays awake while anyone is playing.

**The server forgets rooms when it restarts**, which it does on every deploy
and after idling. That is fine for what it is — a meeting point. Your own
progress is kept in your browser and comes back when you reopen the page, and
**Export puzzle + progress** writes a sheet and all of its branches to a file
you keep.

### Making it private

Rooms are open to anyone with the address. To lock it down, delete
`SLINK_OPEN` from `render.yaml` (or the Render dashboard) and set `SLINK_KEY`
to a phrase of your own. The address then only works with the key on the end:

    https://your-service.onrender.com/?k=your-phrase

## Running it at home instead

Anything with Node 18 or newer:

    npm start

It prints an address for this computer and one for each network interface.
Other people on your network can use the second kind. To reach it from further
away without deploying anything, tunnel it:

    cloudflared tunnel --url http://localhost:8080

## Options

`slink-server.js` reads `PORT`, `SLINK_KEY`, `SLINK_OPEN`, `SLINK_PAGE`,
`SLINK_DATA`, `SLINK_HOST`, `SLINK_MAX_ROOMS` and `SLINK_MAX_VALUE` from the
environment, and takes `--port`, `--key`, `--open`, `--page`, `--data`,
`--host` and `--noopen` on the command line. `node slink-server.js --help`
explains each.

## Making puzzles faster

The page can build its own puzzles, but it is single-threaded and a large
sheet takes a while. **slink-gen** does the same job across every core, and
the page has a download button for it. Its binaries are around 55MB, which is
too big to keep in a Git repository comfortably — if you want the download
button to appear, drop `slink-gen-win-x64.exe` (or the mac/linux build) beside
`index.html` in the deployed site.

## If you also host the page on Vercel

`vercel.json` is here for that case: the same repository can serve the page
from Vercel while the rooms live on Render. Open the Vercel page once with the
room server on the end,

    https://your-site.vercel.app/?server=https://your-service.onrender.com

and it remembers. You do not need this if you are only using Render.
