#!/usr/bin/env node
/* slink-server — shares a Slitherlink plot room between people.

   The page keeps a room in window.storage when it runs inside the Claude
   artifact runtime. Opened as a downloaded file, or used by two people on two
   machines, there is nowhere shared to put one. This serves the page and a
   small key/value store, which is all the page needs.

   Node 18 or newer. No dependencies. Nothing to do with generating puzzles.

     node slink-server.js                 serve the page found next to it
     node slink-server.js --port 9000
     node slink-server.js --page C:\\path\\to\\slitherlink-plotroom.html
*/
"use strict";

const http = require("node:http");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const VERSION = "1.1.0";

/* Hosts like Render hand you the port and any secrets through the
   environment, and never open a browser. */
const ENV = process.env;
const DEFAULTS = {
  port: Number(ENV.PORT) || 8080,
  page: ENV.SLINK_PAGE || "",
  data: ENV.SLINK_DATA || "slink-rooms.json",
  noopen: !!ENV.PORT,                       // a hosted process has no desktop
  key: ENV.SLINK_KEY || ENV.ROOM_KEY || "",
  host: ENV.SLINK_HOST || "0.0.0.0",
  open: ENV.SLINK_OPEN === "1",
};

const HELP = `slink-server ${VERSION} — share a plot room over a network

USAGE
  node slink-server.js [options]

OPTIONS
      --port N      port to listen on            (default ${DEFAULTS.port})
      --page FILE   the plot room html to serve  (default: found nearby)
      --data FILE   where rooms are kept         (default ${DEFAULTS.data})
      --key TEXT    require this key to read or write rooms
                    (one is generated for you; --key "" turns it off)
      --open        no key: anyone who has the address can make and join
                    rooms. Right for a shared server you want open to all;
                    wrong for anything you would mind strangers writing to.
      --host ADDR   address to bind              (default ${DEFAULTS.host})
      --noopen      don't open a browser
  -h, --help
  -v, --version

Keep slitherlink-plotroom.html beside this program, start it, and give the
address it prints to whoever you're playing with. Rooms survive a restart.

REACHING IT FROM OUTSIDE YOUR HOUSE
  The addresses printed on startup are your local network. Anything beyond it
  needs a way in, and which applies depends on your connection:

  Easiest, works almost anywhere — a tunnel. With cloudflared installed:
      cloudflared tunnel --url http://localhost:8080
  It prints an https address that works worldwide, with no router changes.
  ngrok does the same: ngrok http 8080

  If you control your router — forward the port. Point an inbound rule at this
  machine's LAN address and the port above, then share your public IP. This
  fails if your ISP uses CGNAT, which is common on mobile and fibre; if your
  router's WAN address starts 100.64-100.127, you are behind CGNAT and need a
  tunnel.

  Long-lived games — put this program on a cheap VPS or any host that runs
  Node, and everyone connects to it directly.

  Keep the key when you do any of these. Without it, anyone who finds the
  address can read and overwrite every room on the server.
`;

function parseArgs(argv) {
  const o = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === "-h" || a === "--help") { o.help = true; continue; }
    if (a === "-v" || a === "--version") { o.version = true; continue; }
    if (!a.startsWith("-")) throw new Error(`don't know what to do with "${a}"`);
    a = a.replace(/^--?/, "");
    let val = null;
    const eq = a.indexOf("=");
    if (eq > 0) { val = a.slice(eq + 1); a = a.slice(0, eq); }
    if (!(a in DEFAULTS)) throw new Error(`unknown option --${a}`);
    if (a === "noopen") { o.noopen = true; continue; }
    if (a === "open") { o.open = true; continue; }
    if (val === null) val = argv[++i];
    if (val === undefined) throw new Error(`--${a} needs a value`);
    o[a] = a === "port" ? Number(val) : val;
  }
  return o;
}

function openBrowser(url) {
  try {
    if (process.platform === "win32")
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else if (process.platform === "darwin")
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch (e) { /* the address is printed anyway */ }
}

function lanAddresses(port) {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name in ifaces)
    for (const ni of ifaces[name] || [])
      if (ni.family === "IPv4" && !ni.internal) out.push(`http://${ni.address}:${port}/`);
  return out;
}

const PAGE_NAMES = ["slitherlink-plotroom.html", "plotroom.html", "index.html"];

/* Only the app's own keys, so this can never be used as someone else's free
   storage, and nothing can escape the namespace. */
const KEY_OK = /^sl:[A-Za-z0-9:_.-]{1,120}$/;

/* Constant-time-ish compare, so the key can't be guessed a character at a
   time from response timings. */
function sameKey(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function makeServer(opt) {
  const needKey = !!opt.key;
  const hits = new Map();                 // crude per-address rate limit
  const allow = ip => {
    const now = Date.now();
    let r = hits.get(ip);
    if (!r || now - r.t > 10000) { r = { t: now, n: 0 }; hits.set(ip, r); }
    if (hits.size > 5000) hits.clear();
    return ++r.n <= 600;                  // 600 requests per 10s per address
  };
  const here = path.dirname(process.execPath.includes("slink-server")
    ? process.execPath : __filename);
  const findPage = () => {
    if (opt.page) return path.resolve(opt.page);
    for (const dir of [process.cwd(), here])
      for (const n of PAGE_NAMES) {
        const f = path.join(dir, n);
        if (fs.existsSync(f)) return f;
      }
    return null;
  };

  const MAX_ROOMS = Number(ENV.SLINK_MAX_ROOMS) || 300;
  const MAX_VALUE = Number(ENV.SLINK_MAX_VALUE) || 2e6;
  const store = new Map();
  const touched = new Map();              // key -> last write, for eviction
  const evict = () => {
    while (store.size > MAX_ROOMS) {
      let oldest = null, when = Infinity;
      for (const [k, t] of touched) if (t < when) { when = t; oldest = k; }
      if (oldest === null) break;
      store.delete(oldest); touched.delete(oldest);
    }
  };
  const file = path.resolve(opt.data);
  try {
    if (fs.existsSync(file))
      for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, "utf8"))))
        store.set(k, v);
  } catch (e) { /* start empty rather than refuse to run */ }

  let saveTimer = null;
  const saveSoon = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { fs.writeFileSync(file, JSON.stringify(Object.fromEntries(store))); }
      catch (e) { /* keep serving; the rooms are still in memory */ }
    }, 800);
  };

  const server = http.createServer((req, res) => {
    const u = (req.url || "/").split("?")[0];
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }

    if (u === "/kv/__health") {
      // unauthenticated on purpose: it only says "a room server lives here"
      res.writeHead(200, { ...cors, "Content-Type": "text/plain" });
      return res.end(needKey ? "ok key" : "ok");
    }
    if (u.startsWith("/kv/")) {
      const ip = req.socket.remoteAddress || "?";
      if (!allow(ip)) { res.writeHead(429, cors); return res.end("slow down"); }
      if (needKey) {
        const given = req.headers["x-room-key"]
          || new URL(req.url, "http://x").searchParams.get("k") || "";
        if (!sameKey(given, opt.key)) {
          res.writeHead(401, { ...cors, "Content-Type": "text/plain" });
          return res.end("this server needs the room key");
        }
      }
      const key = decodeURIComponent(u.slice(4));
      if (!KEY_OK.test(key)) {
        res.writeHead(400, { ...cors, "Content-Type": "text/plain" });
        return res.end("not a room key");
      }
      if (req.method === "GET") {
        if (!store.has(key)) { res.writeHead(404, cors); return res.end(); }
        res.writeHead(200, { ...cors, "Content-Type": "text/plain; charset=utf-8",
                             "Cache-Control": "no-store" });
        return res.end(store.get(key));
      }
      if (req.method === "PUT" || req.method === "POST") {
        let raw = "", size = 0, tooBig = false;
        req.on("data", d => {
          size += d.length;
          if (size > MAX_VALUE) {
            // Stop keeping it, but let the request finish so the sender gets a
            // real 413 rather than a broken socket. Only a wildly oversized
            // body gets hung up on.
            tooBig = true; raw = "";
            if (size > MAX_VALUE * 50) req.destroy();
          } else raw += d;
        });
        req.on("end", () => {
          if (tooBig) { res.writeHead(413, cors); return res.end("too big"); }
          store.set(key, raw);
          touched.set(key, Date.now());
          evict();
          saveSoon();
          res.writeHead(200, { ...cors, "Content-Type": "text/plain" });
          res.end("ok");
        });
        return;
      }
      res.writeHead(405, cors); return res.end();
    }
    if (u === "/" || u === "/index.html") {
      const f = findPage();
      if (!f) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Put slitherlink-plotroom.html next to this program "
          + "(or pass --page path/to/file.html) and reload.");
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8",
                           "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(f));
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  return { server, findPage, file };
}

function main() {
  let opt;
  try { opt = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error("slink-server: " + e.message + "\nTry --help."); process.exit(2); }
  if (opt.help) { process.stdout.write(HELP); return; }
  if (opt.version) { console.log(VERSION); return; }
  if (!Number.isFinite(opt.port) || opt.port < 1 || opt.port > 65535) {
    console.error("slink-server: --port must be a number between 1 and 65535");
    process.exit(2);
  }

  if (!opt.open && !opt.key) {
    opt.key = require("node:crypto").randomBytes(6).toString("base64url");
    if (ENV.PORT) {
      // Hosted, with no key configured: every restart would invent a new one
      // and quietly break the link you handed out.
      console.log("");
      console.log("  No SLINK_KEY is set, so this key lasts only until the");
      console.log("  service restarts. Set SLINK_KEY in the host's environment");
      console.log("  to keep the same link working.");
    }
  }
  const { server, findPage, file } = makeServer(opt);
  server.on("error", e => {
    console.error(`slink-server: could not listen on port ${opt.port} (${e.code}).`);
    if (e.code === "EADDRINUSE")
      console.error("  Something else is using it. Try --port 8081.");
    if (e.code === "EACCES")
      console.error("  That port needs privileges. Try a number above 1024.");
    process.exit(1);
  });
  server.listen(opt.port, opt.host, () => {
    const page = findPage();
    console.log(`slink-server ${VERSION}`);
    console.log("  On this computer:  http://localhost:" + opt.port + "/");
    const lan = lanAddresses(opt.port);
    if (lan.length) {
      console.log("  For other people on your network:");
      for (const a of lan) console.log("    " + a);
    }
    console.log(page ? "  Serving page: " + page
                     : "  NOTE: no plot room html found yet — put "
                       + "slitherlink-plotroom.html beside this program.");
    console.log("  Rooms are kept in " + file);
    if (opt.key) {
      console.log("");
      console.log("  Room key: " + opt.key);
      console.log("  Share links with the key in them, or nobody can get in:");
      const lan = lanAddresses(opt.port);
      const sample = lan[0] || ("http://localhost:" + opt.port + "/");
      console.log("    " + sample + "?k=" + opt.key);
    } else {
      console.log("");
      console.log("  NO KEY — anyone who can reach this address can read and");
      console.log("  overwrite every room. Only do this on a network you trust.");
    }
    console.log("");
    console.log("  Playing with someone outside your network? See --help:");
    console.log("    cloudflared tunnel --url http://localhost:" + opt.port);
    console.log("  gives an https address that works anywhere, no router changes.");
    console.log("  Windows may ask to allow this through the firewall — "
                + "say yes for private networks.");
    if (ENV.PORT) {
      console.log("");
      console.log("  Running on a host. On a free plan the service sleeps when");
      console.log("  idle — the first visitor after a nap waits up to a minute,");
      console.log("  then it stays awake while anyone is playing.");
    } else {
      console.log("  Leave this window open. Ctrl+C to stop.");
    }
    if (!opt.noopen)
      openBrowser("http://localhost:" + opt.port + "/" + (opt.key ? "?k=" + opt.key : ""));
  });
}

if (require.main === module) main();
module.exports = { makeServer, parseArgs, lanAddresses, VERSION };
