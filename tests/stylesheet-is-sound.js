/* A rule with no selector is not ignored: the browser throws away what
   follows it too. That is how a bracket meant for one row came to be drawn
   down the whole panel, and nothing else noticed. */
const fs = require("fs"), path = require("path");
const css = fs.readFileSync(
  path.join(require("./pageload.js").findPageDir(__dirname), "styles.css"), "utf8");
let pass=0,fail=0;
const ck=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);ok?pass++:fail++;
 console.log(`${ok?'PASS':'FAIL'}  ${n}${ok?'':`  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);};

// strip comments before looking at the shape of it
const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");

let depth = 0, under = 0;
for (const ch of bare) {
  if (ch === "{") depth++;
  else if (ch === "}") { depth--; if (depth < 0) { under++; depth = 0; } }
}
ck("every rule is closed", depth, 0);
ck("and none is closed twice", under, 0);

// a declaration sitting where a selector should be
const orphans = [];
for (const chunk of bare.split("}")) {
  const head = chunk.replace(/^[\s\n]*/, "").split("{")[0];
  if (!head.trim()) continue;
  if (/^[a-z-]+\s*:/.test(head.trim()) && !head.includes("{")) orphans.push(head.trim().slice(0, 50));
}
if (orphans.length) console.log("   orphaned:", orphans.join(" | "));
ck("no declaration is left without a selector", orphans.length, 0);

// the pairing bracket in particular, since that is what broke
ck("a paired row is positioned, so its bracket stays beside it",
   /\.tw--paired\{[^}]*position:relative/.test(bare), true);
ck("and the bracket is drawn on it", /\.tw--paired::before\{/.test(bare), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
