# Putting the room server on Render

Free, reachable from anywhere, and nothing to leave running at home.

## What you need

This folder, in a Git repository you can push to GitHub:

    slink-server.js              the server
    slitherlink-plotroom.html    the page it serves
    package.json                 tells Render how to start it
    render.yaml                  the deploy description

## Steps

1. Push this folder to a GitHub repository.
2. On Render, choose **New → Blueprint** and select the repository. It reads
   `render.yaml` and creates a free web service.
3. Open the service's **Environment** tab and set **SLINK_KEY** to any phrase
   you like, say `purple-otter-42`. This is what stops strangers reading and
   overwriting your rooms.
4. Wait for the deploy, then open the address Render gives you, with the key
   on the end:

       https://your-service.onrender.com/?k=purple-otter-42

   Anyone you send that link to can join. One of you starts a sheet, reads out
   the four-letter code, and the others use **Join a sheet**.

## Things worth knowing

**It sleeps.** On the free plan the service stops when nobody has used it for
a while. The first person to open the link after that waits up to a minute for
it to wake. Once awake it stays awake while anyone is playing, because the page
polls every few seconds.

**Its disk is wiped** on every restart and every deploy, so rooms on the server
are temporary. That is fine for what this is for: the server is a meeting
point. Each player's own progress lives in their browser and comes back when
they reopen the page. Use **Export puzzle + progress** for anything you want
to keep for certain — it saves the sheet and every branch to a file.

**Set SLINK_KEY.** Skip it and the server invents a new key each time it
restarts, which quietly breaks the link you gave people.

## Not using Render?

Anything that runs Node 18+ works — Koyeb, Northflank, a VPS. The server reads
`PORT` from the environment, so most hosts need no configuration beyond
`SLINK_KEY`. And if you would rather not deploy at all, run it at home and
tunnel it:

    cloudflared tunnel --url http://localhost:8080
