// Reports translation status of upstream script files: how many dialogue strings are still Japanese.
const { fs, path } = require('./lib');
const dir = process.argv[2] || path.join(__dirname, '..', 'upstream', 'StoneOfBeginnings', 'script');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : f.name.endsWith('.txt') && files.push(path.join(d, f.name)); })(dir);
// script/Day2_scripts/X.txt is the translated version of script/X.txt (build.bat inserts that one), so count only it.
const override = new Set(files.filter(f => f.includes('Day2_scripts')).map(f => path.basename(f)));
for (let i = files.length - 1; i >= 0; i--) if (!files[i].includes('Day2_scripts') && override.has(path.basename(files[i]))) files.splice(i, 1);
const jp = /[぀-ヿ一-鿿]/;
let tot = { files: 0, done: 0, partial: 0, todo: 0, notext: 0, jpStr: 0, enStr: 0 };
const rows = [];
for (const f of files) {
  const buf = fs.readFileSync(f);
  let s = buf.toString('utf8');
  if (s.includes('�')) s = new TextDecoder('shift_jis').decode(buf);
  const strs = s.match(/"(?:[^"\\]|\\.)*"/g) || [];
  const j = strs.filter(x => jp.test(x)).length, e = strs.length - j;
  tot.files++; tot.jpStr += j; tot.enStr += e;
  const k = strs.length === 0 ? 'notext' : j === 0 ? 'done' : e === 0 ? 'todo' : 'partial';
  tot[k]++; rows.push([path.relative(dir, f), j, e, k]);
}
console.log(tot);
if (process.argv.includes('--list')) rows.filter(r => r[3] !== 'done' && r[3] !== 'notext').forEach(r => console.log(r.join('\t')));
