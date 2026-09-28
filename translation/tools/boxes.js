// Export a scene's Japanese text boxes to JSON for translation, and import the English back.
//
//   node tools/boxes.js export <id>      → work/tl/<id>.json   (only groups that contain Japanese)
//   node tools/boxes.js import <id>      → rewrites the scene script from the JSON (backup kept in work/backup/)
//
// A "group" is a run of consecutive text lines of the same command (dialogtxt lines = one box, or a single
// menutitle / menutxt / popuptxt). In the JSON, fill `en` with an array of lines:
//   - dialogtxt: 1-3 lines, keep each ≲34 chars (38 hard max). Use "　" (full-width space) to indent
//     continuation lines of (thoughts) like upstream does.
//   - every other command (menutxt, choicetxt, popuptxt, placetxt, dialogbig, ...): exactly 1 line.
// Name codes: [NAME 0] hero real name, [NAME 1] partner, [NAME 2] hero nickname, [NAME 4] item name. Plain " is fine (auto-escaped).
const { fs, path, WORK } = require('./lib');

const UP = path.join(__dirname, '..', 'upstream', 'StoneOfBeginnings', 'script');
const TL = path.join(WORK, 'tl');
const JP = /[぀-ヿ一-鿿！-～]/;
// Text commands we translate (setname / strlen are engine names; handle those by hand). Args before the string are kept as-is.
const LINE = /^(\s*)(dialogtxt|dialogbig|menutitle|menutxt|menutxtp|choicetxt|popuptxt|placetxt|tabletxt|dictionarytxt)(\s+)((?:[@\w-]+,\s*)*)"((?:[^"\\]|\\.)*)"\s*$/;

// The decompiler misreads katakana 0x83?C as name codes; real names come out as Greek letters.
const fixJp = s => s
  .replace(/\[NAME ([4-8])\]/g, (_, n) => 'キソネポレ'[n - 4])
  .replace(/[βγδζ]/g, c => `[NAME ${'βγδ_ζ'.indexOf(c)}]`);

const sceneFile = id => {
  const d2 = path.join(UP, 'Day2_scripts', id + '.txt');
  return fs.existsSync(d2) ? d2 : path.join(UP, id + '.txt');
};

function groups(lines) {
  const res = [];
  let cur = null;
  lines.forEach((l, i) => {
    const m = l.match(LINE);
    if (m && m[2] === 'dialogtxt' && cur && cur.cmd === 'dialogtxt' && cur.end === i - 1) {
      cur.end = i; cur.text.push(m[5]);
    } else if (m) {
      cur = { start: i, end: i, cmd: m[2], label: m[4], indent: m[1], gap: m[3], text: [m[5]] };
      res.push(cur);
    } else {
      cur = null;
    }
  });
  return res;
}

const [cmd, id] = process.argv.slice(2);
if (!id) { console.error('usage: node tools/boxes.js export|import <id>'); process.exit(1); }
const file = sceneFile(id);
const jsonFile = path.join(TL, id + '.json');

if (cmd === 'export') {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = groups(lines)
    .filter(g => g.text.some(t => JP.test(t)))
    .map(g => ({ line: g.start + 1, cmd: g.cmd, jp: g.text.map(fixJp), en: null }));
  fs.mkdirSync(TL, { recursive: true });
  if (fs.existsSync(jsonFile)) { console.error(`${jsonFile} exists; not overwriting`); process.exit(1); }
  fs.writeFileSync(jsonFile, JSON.stringify({ scene: id, file: path.relative(UP, file), boxes: out }, null, 1));
  console.log(`${id}: ${out.length} groups → ${jsonFile}`);
} else if (cmd === 'import') {
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  // Optional work/tl/<id>.en.json: { "<line>": ["en line", ...], ... } fills `en` (and is merged into <id>.json).
  const enFile = path.join(TL, id + '.en.json');
  if (fs.existsSync(enFile)) {
    const map = JSON.parse(fs.readFileSync(enFile, 'utf8'));
    for (const b of data.boxes) if (map[b.line]) b.en = map[b.line];
    const extra = Object.keys(map).filter(k => !data.boxes.some(b => String(b.line) === k));
    if (extra.length) { console.error(`${id}.en.json has lines not in the export: ${extra.join(', ')}`); process.exit(1); }
    fs.writeFileSync(jsonFile, JSON.stringify(data, null, 1));
  }
  const raw = fs.readFileSync(file, 'utf8');
  const nl = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const byLine = new Map(groups(lines).map(g => [g.start + 1, g]));
  const problems = [];
  for (const b of data.boxes) {
    const g = byLine.get(b.line);
    if (!g || g.cmd !== b.cmd) { problems.push(`line ${b.line}: script changed since export`); continue; }
    if (!Array.isArray(b.en) || !b.en.length) { problems.push(`line ${b.line}: no translation`); continue; }
    if (g.cmd !== 'dialogtxt' && b.en.length !== 1) problems.push(`line ${b.line}: ${g.cmd} must be 1 line`);
    if (g.cmd === 'dialogtxt' && b.en.length > 3) problems.push(`line ${b.line}: more than 3 lines in a box`);
    for (const t of b.en) {
      if (t.length > 38) problems.push(`line ${b.line}: too long (${t.length}): ${t}`);
      if (JP.test(t.replace(/　/g, ''))) problems.push(`line ${b.line}: still has Japanese: ${t}`);
    }
  }
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

  const backup = path.join(WORK, 'backup', path.basename(file));
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);

  // Replace bottom-up so earlier line numbers stay valid.
  for (const b of [...data.boxes].sort((x, y) => y.line - x.line)) {
    const g = byLine.get(b.line);
    // Plain quotes in the translation are escaped for the script compiler (already-escaped \" is kept).
    const esc = t => t.replace(/\\"/g, '"').replace(/"/g, '\\"');
    const newLines = b.en.map(t => `${g.indent}${g.cmd}${g.gap}${g.label}"${esc(t)}"`);
    lines.splice(g.start, g.end - g.start + 1, ...newLines);
  }
  fs.writeFileSync(file, lines.join(nl));
  console.log(`${id}: imported ${data.boxes.length} groups into ${path.relative(UP, file)}`);
} else {
  console.error('unknown command ' + cmd);
  process.exit(1);
}
