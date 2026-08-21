/* Runs the suites that do not need a port, several at a time. Each test builds
   its own page and talks to nobody else, so they do not have to wait in line.
   The ones that start a server are left out — two of them cannot hold the same
   port at once. Run those individually; tests/README.md lists them. */
const { execFile } = require("child_process");
const fs = require("fs"),
  path = require("path"),
  os = require("os");

const here = __dirname;
const SKIP = new Set([
  "run-all.js",
  "pageload.js",
  "verify-pack-is-unique.js",
  "server-basics.js",
  "server-with-key.js",
  "page-and-rooms-apart.js",
  "puzzle-links.js",
  "generator-page.js",
  "generator-download-link.js",
  "importing-packs.js",
  "generating-progress.js",
]);

const files = fs
  .readdirSync(here)
  .filter(f => f.endsWith(".js") && !SKIP.has(f))
  .sort();

const AT_ONCE = Math.max(2, Math.min(4, os.cpus().length || 2));
const queue = [...files];
const broke = [];
let pass = 0,
  fail = 0;
const started = Date.now();

function runOne(file) {
  return new Promise(done => {
    execFile(
      "node",
      [path.join(here, file)],
      { cwd: path.join(here, ".."), encoding: "utf8", maxBuffer: 1 << 24 },
      (err, out) => {
        const tally = /(\d+) passed, (\d+) failed/.exec(out || "");
        if (tally) {
          pass += +tally[1];
          fail += +tally[2];
          console.log(`${file.padEnd(28)} ${tally[1]} passed, ${tally[2]} failed`);
        } else {
          console.log(`${file.padEnd(28)} did not report`);
          broke.push(file);
        }
        done();
      },
    );
  });
}

async function worker() {
  while (queue.length) await runOne(queue.shift());
}

Promise.all(Array.from({ length: AT_ONCE }, worker)).then(() => {
  const took = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\n${pass} passed, ${fail} failed across ${files.length} files in ${took}s`);
  if (broke.length) console.log("did not run:", broke.join(", "));
  process.exit(fail || broke.length ? 1 : 0);
});
