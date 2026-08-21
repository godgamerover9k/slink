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
  /* The browser loads the program as ES modules. jsdom cannot run those, so
     they are stitched into one classic script here: imports and exports are
     stripped and the files concatenated in the order main.js lists them. This
     is only for the tests — the page itself is left as modules. */
  html = html.replace(/<script type="module" src="([^"]+)"><\/script>/g, (whole, src) => {
    const entry = path.join(dir, src);
    if (!fs.existsSync(entry)) return whole;
    const order = [...fs.readFileSync(entry, "utf8").matchAll(/import\s+"\.\/([^"]+)"/g)].map(
      m => m[1],
    );
    const joined = order
      .map(name => {
        const file = path.join(path.dirname(entry), name);
        return fs
          .readFileSync(file, "utf8")
          .replace(/^import[^;]*;\s*$/gm, "")            // what it needs
          .replace(/\n\/\* what other parts[\s\S]*?^export \{[\s\S]*?^\};\s*$/m, "")   // what it offers
          .replace(/^export \{[\s\S]*?^\};\s*$/m, "");
      })
      .join("\n");
    return "<script>" + joined + "<\/script>";
  });

  return html;
}

/* The same stripping, for tests that run a few of the script files directly
   rather than through the page. */
function plainScript(names, from) {
  const dir = path.join(findPageDir(from || process.cwd()), "js");
  return names
    .map(name =>
      fs
        .readFileSync(path.join(dir, name.endsWith(".js") ? name : name + ".js"), "utf8")
        .replace(/^import[^;]*;\s*$/gm, "")
        .replace(/\n\/\* what other parts[\s\S]*?^export \{[\s\S]*?^\};\s*$/m, "")
        .replace(/^export \{[\s\S]*?^\};\s*$/m, ""),
    )
    .join("\n");
}

module.exports = { loadPage, findPageDir, plainScript };
