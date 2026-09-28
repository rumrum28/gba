// Cross-references build.bat with per-scene translation status, to decide what to work on next.
// Usage: node tools/plan.js [--all]
const { fs, path } = require('./lib');

const UP = path.join(__dirname, '..', 'upstream', 'StoneOfBeginnings');
const bat = fs.readFileSync(path.join(UP, 'build.bat'), 'utf8');
const inBuild = new Set([...bat.matchAll(/^script_inserter\\swordcraft3c .*?script\\(?:Day2_scripts\\)?([0-9a-f]+)\.txt/gm)].map(m => m[1]));
const jp = /[぀-ヿ一-鿿]/;

// Day2_scripts copies override root copies (see TRANSLATION.md).
const files = {};
for (const d of ['script', 'script/Day2_scripts']) {
  for (const f of fs.readdirSync(path.join(UP, d))) if (f.endsWith('.txt')) files[f.slice(0, -4)] = path.join(UP, d, f);
}

const rows = [];
for (const [id, f] of Object.entries(files)) {
  const strs = fs.readFileSync(f, 'utf8').match(/"(?:[^"\\]|\\.)*"/g) || [];
  const j = strs.filter(x => jp.test(x)).length;
  rows.push({ id, j, e: strs.length - j, built: inBuild.has(id), file: path.relative(UP, f) });
}
const fmt = r => `${r.id}(${r.j}jp/${r.e}en)`;
const pick = (built, cond) => rows.filter(r => r.built === built && cond(r));

console.log('scenes in build.bat:', inBuild.size, 'of', rows.length);
console.log('\nBUILT but still has JP:\n ', pick(true, r => r.j > 0).map(fmt).join(' '));
console.log('\nNOT BUILT, fully EN:', pick(false, r => r.j === 0).length, '\n ', pick(false, r => r.j === 0).map(r => r.id).join(' '));
console.log('\nNOT BUILT, >80% EN:\n ', pick(false, r => r.j > 0 && r.e / (r.j + r.e) > 0.8).map(fmt).join(' '));
const todo = pick(false, r => r.e / (r.j + r.e) <= 0.8);
console.log('\nNOT BUILT, mostly JP:', todo.length, 'scenes,', todo.reduce((a, r) => a + r.j, 0), 'JP strings');
if (process.argv.includes('--all')) console.log(' ', todo.map(fmt).join(' '));
