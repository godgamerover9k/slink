/* Runs every browser-side suite and prints a tally. The server and deployment
   suites are skipped here because they bind ports; run those individually. */
const {execFileSync}=require('child_process');
const fs=require('fs'), path=require('path');
const here=__dirname;
const SKIP=new Set(['run-all.js','pageload.js','verify-pack-is-unique.js',
  'server-basics.js','server-with-key.js','page-and-rooms-apart.js',
  'puzzle-links.js','generator-page.js','generator-download-link.js',
  'importing-packs.js','generating-progress.js']);
const files=fs.readdirSync(here).filter(f=>f.endsWith('.js')&&!SKIP.has(f)).sort();
let pass=0,fail=0,broke=[];
for(const f of files){
  process.stdout.write(f.padEnd(20));
  try{
    const out=execFileSync('node',[path.join(here,f)],
      {cwd:path.join(here,'..'),encoding:'utf8',stdio:['ignore','pipe','pipe']});
    const m=/(\d+) passed, (\d+) failed/.exec(out);
    if(m){ pass+=+m[1]; fail+=+m[2]; console.log(`${m[1]} passed, ${m[2]} failed`); }
    else { console.log('no tally found'); broke.push(f); }
  }catch(e){ console.log('ERROR'); broke.push(f); }
}
console.log(`\n${pass} passed, ${fail} failed across ${files.length} files`);
if(broke.length)console.log('did not run:', broke.join(', '));
process.exit(fail||broke.length?1:0);
