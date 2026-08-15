/* Tests drive the page as one document. In the browser it arrives as a page
   plus a stylesheet plus a folder of scripts; here those are stitched back
   together so jsdom sees exactly the same thing without needing a server. */
const fs = require("fs");
const path = require("path");

function findPageDir(start) {
  const tries = [
    path.join(start, "public"),
    path.join(start, "..", "public"),
    start,
    path.join(start, ".."),
  ];
  for (const dir of tries) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
    if (fs.existsSync(path.join(dir, "slitherlink-plotroom.html"))) return dir;
  }
  throw new Error("cannot find the page near " + start);
}

function loadPage(from) {
  const dir = findPageDir(from || process.cwd());
  const file = fs.existsSync(path.join(dir, "index.html"))
    ? path.join(dir, "index.html")
    : path.join(dir, "slitherlink-plotroom.html");
  let html = fs.readFileSync(file, "utf8");

  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
    const f = path.join(dir, href);
    return fs.existsSync(f) ? "<style>" + fs.readFileSync(f, "utf8") + "</style>" : m;
  });
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const f = path.join(dir, src);
    return fs.existsSync(f) ? "<script>" + fs.readFileSync(f, "utf8") + "</script>" : m;
  });
  return html;
}

module.exports = { loadPage, findPageDir };
