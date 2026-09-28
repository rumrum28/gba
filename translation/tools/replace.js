// Applies exact string replacements (all occurrences) to a script file, keeping a backup in work/backup/.
// Usage: node tools/replace.js <script.txt> <edits.json>   where edits.json = [["old line text", "new line text"], ...]
// Every "old" must be found at least once, otherwise nothing is written.
const { fs, path, WORK } = require('./lib');

const [file, editsFile] = process.argv.slice(2);
const edits = JSON.parse(fs.readFileSync(editsFile, 'utf8'));
let src = fs.readFileSync(file, 'utf8');
const missing = edits.filter(([a]) => !src.includes(`"${a}"`));
if (missing.length) { console.error('Not found, nothing written:\n' + missing.map(m => '  ' + m[0]).join('\n')); process.exit(1); }

const backupDir = path.join(WORK, 'backup');
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, path.basename(file));
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup); // keep the first (upstream) version only

let count = 0;
for (const [a, b] of edits) {
  const parts = src.split(`"${a}"`);
  count += parts.length - 1;
  src = parts.join(`"${b}"`);
}
fs.writeFileSync(file, src);
console.log(`${path.basename(file)}: ${count} replacements`);
