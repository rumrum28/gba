// Adds scene ids to upstream build.bat (before the flips lines), skipping ones already listed.
// Usage: node tools/addbuild.js "<section comment>" <id> [id...]     (ids like 17e5e5c; Day2_scripts copies are used when present)
const { fs, path } = require('./lib');

const UP = path.join(__dirname, '..', 'upstream', 'StoneOfBeginnings');
const bat = path.join(UP, 'build.bat');
const [comment, ...ids] = process.argv.slice(2);
let s = fs.readFileSync(bat, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';

const listed = new Set([...s.matchAll(/^script_inserter\\swordcraft3c .*?([0-9a-f]+)\.txt/gm)].map(m => m[1]));
const add = ids.filter(id => !listed.has(id));
const lines = add.map(id => {
  const rel = fs.existsSync(path.join(UP, 'script', 'Day2_scripts', id + '.txt')) ? `script\\Day2_scripts\\${id}.txt` : `script\\${id}.txt`;
  if (!fs.existsSync(path.join(UP, rel))) throw new Error('missing ' + rel);
  return `script_inserter\\swordcraft3c swordcraft3-test.gba ${rel} --pos=${id}`;
});
if (!lines.length) { console.log('nothing to add'); process.exit(0); }

const at = s.indexOf('tools\\flips');
if (at < 0) throw new Error('flips line not found in build.bat');
s = s.slice(0, at) + [`::${comment}`, ...lines, '', ''].join(nl) + s.slice(at);
fs.writeFileSync(bat, s);
console.log(`added ${lines.length} (skipped ${ids.length - lines.length} already listed)`);
