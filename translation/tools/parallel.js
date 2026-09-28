// Builds a JP→EN parallel corpus from scenes that exist as a JP copy (script/X.txt) and an EN copy (script/Day2_scripts/X.txt).
// Writes work/parallel.tsv. Also: node tools/parallel.js --grep <text>  to search the corpus (JP or EN).
const { fs, path, WORK } = require('./lib');

const S = path.join(__dirname, '..', 'upstream', 'StoneOfBeginnings', 'script');
const out = path.join(WORK, 'parallel.tsv');
const strings = f => (fs.readFileSync(f, 'utf8').match(/^\s*\w+\s+(?:@\w+,\s*)?"(?:[^"\\]|\\.)*"/gm) || []).map(l => l.match(/"((?:[^"\\]|\\.)*)"/)[1]);

if (process.argv[2] === '--grep') {
  const q = process.argv[3];
  for (const l of fs.readFileSync(out, 'utf8').split('\n')) if (l.includes(q)) console.log(l);
  process.exit(0);
}

// Group consecutive text lines into boxes; the code lines between boxes are the same in both versions, so boxes pair up in order.
const boxes = f => {
  const res = [];
  let cur = null;
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*(dialogtxt|menutitle|menutxt|popuptxt)\s+(?:@\w+,\s*)?"((?:[^"\\]|\\.)*)"/);
    if (m) (cur ??= (res.push([]), res.at(-1))).push(m[2]);
    else if (l.trim()) cur = null;
  }
  return res;
};
const JP = /[぀-ヿ一-鿿]/;
const rows = [];
let paired = 0, skipped = 0;
for (const f of fs.readdirSync(path.join(S, 'Day2_scripts'))) {
  const backup = path.join(WORK, 'backup', f); // prefer the untouched upstream EN copy if we edited it
  const en = boxes(fs.existsSync(backup) ? backup : path.join(S, 'Day2_scripts', f));
  const jp = boxes(path.join(S, f));
  if (en.length !== jp.length) { skipped++; continue; }
  paired++;
  jp.forEach((j, i) => {
    const a = j.join(' '), b = en[i].join(' ');
    if (JP.test(a) && !JP.test(b)) rows.push(`${f.slice(0, -4)}\t${a}\t${b}`);
  });
}
fs.writeFileSync(out, rows.join('\n'));
console.log(`paired ${paired} scenes (skipped ${skipped} with different box counts), ${rows.length} box pairs → ${out}`);
