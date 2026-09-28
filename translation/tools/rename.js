// Renames a term across the scripts we translated (files with a work/backup copy) and work/tl/*.en.json,
// then reports any text line that became longer than 38 chars.
// Usage: node tools/rename.js "Old Term" "New Term" [--dry]
const { fs, path, WORK } = require('./lib');

const [from, to] = process.argv.slice(2);
const dry = process.argv.includes('--dry');
const S = path.join(__dirname, '..', 'upstream', 'StoneOfBeginnings', 'script');
const ours = fs.readdirSync(path.join(WORK, 'backup')).filter(f => /^[0-9a-f]+\.txt$/.test(f));
const targets = [];
for (const f of ours) {
  const d2 = path.join(S, 'Day2_scripts', f);
  targets.push(fs.existsSync(d2) ? d2 : path.join(S, f));
}
for (const f of fs.readdirSync(path.join(WORK, 'tl'))) if (f.endsWith('.en.json') || f.startsWith('make_')) targets.push(path.join(WORK, 'tl', f));

let files = 0, hits = 0;
const long = [];
for (const f of targets) {
  const src = fs.readFileSync(f, 'utf8');
  if (!src.includes(from)) continue;
  const out = src.split(from).join(to);
  hits += src.split(from).length - 1;
  files++;
  if (f.endsWith('.txt')) {
    out.split(/\r?\n/).forEach((l, i) => {
      const m = l.match(/"((?:[^"\\]|\\.)*)"\s*$/);
      if (m && l.includes(to) && m[1].replace(/\\"/g, '"').length > 38) long.push(`${path.basename(f)}:${i + 1} (${m[1].length}) ${m[1]}`);
    });
  }
  if (!dry) fs.writeFileSync(f, out);
}
console.log(`${dry ? '[dry] ' : ''}${from} -> ${to}: ${hits} occurrences in ${files} files`);
if (long.length) console.log('TOO LONG now:\n' + long.join('\n'));
