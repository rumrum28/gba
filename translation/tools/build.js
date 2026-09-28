// Runs upstream build.bat, reports insertion problems, and copies the outputs:
//   build/SNSS3_EN_WIP.bps  and  games/Summon Night Swordcraft Story 3 (EN WIP).gba
const { execSync } = require('child_process');
const { fs, path, ROOT, WORK, BUILD } = require('./lib');

const UP = path.join(__dirname, '..', 'upstream', 'StoneOfBeginnings');
const base = path.join(UP, 'swordcraft3.gba');
if (!fs.existsSync(base)) fs.copyFileSync(path.join(WORK, 'original.gba'), base);

// build.bat calls tools by relative path, which cmd refuses when NoDefaultCurrentDirectoryInExePath is set.
const env = { ...process.env };
delete env.NoDefaultCurrentDirectoryInExePath;
let log;
try {
  log = execSync('cmd /c "build.bat < nul"', { cwd: UP, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
} catch (e) {
  log = (e.stdout || '') + (e.stderr || '');
}
fs.writeFileSync(path.join(WORK, 'build.log'), log);

const lines = log.split(/\r?\n/);
const bad = [];
lines.forEach((l, i) => {
  if (/too large|Too many|Unexpected|Unterminated|Insertion failed|nvalid|error/i.test(l) && !/No errors found/.test(l)) {
    const cmd = lines.slice(Math.max(0, i - 4), i).reverse().find(x => /swordcraft3c/.test(x)) || '';
    bad.push(`${(cmd.match(/script\\\S+/) || [''])[0]}  ${l.trim()}`);
  }
});

fs.mkdirSync(BUILD, { recursive: true });
fs.copyFileSync(path.join(UP, 'patches', 'swordcraft3.bps'), path.join(BUILD, 'SNSS3_EN_WIP.bps'));
fs.copyFileSync(path.join(UP, 'swordcraft3-test.gba'), path.join(ROOT, 'games', 'Summon Night Swordcraft Story 3 (EN WIP).gba'));
const size = fs.statSync(path.join(BUILD, 'SNSS3_EN_WIP.bps')).size;
console.log(bad.length ? 'PROBLEMS:\n' + bad.join('\n') : 'Build clean.');
console.log(`patch: build/SNSS3_EN_WIP.bps (${(size / 1024).toFixed(0)} KB), ROM copied to games/`);
