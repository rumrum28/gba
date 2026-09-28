// One-time setup: extracts the original JP ROM from the zip into work/original.gba.
const { execFileSync } = require('child_process');
const { fs, path, GAMES, ORIGINAL_ROM, WORK } = require('./lib');

fs.mkdirSync(WORK, { recursive: true });
if (fs.existsSync(ORIGINAL_ROM)) { console.log('Already set up:', ORIGINAL_ROM); process.exit(0); }
const zip = path.join(GAMES, 'Summon Night - Craft Sword Monogatari - Hajimari no Ishi (Japan).zip');
const tmp = path.join(WORK, 'unzip-tmp');
execFileSync(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-xf', zip, '-C', (fs.mkdirSync(tmp, { recursive: true }), tmp)]);
const gba = fs.readdirSync(tmp).find(f => f.endsWith('.gba'));
fs.renameSync(path.join(tmp, gba), ORIGINAL_ROM);
fs.rmSync(tmp, { recursive: true });
console.log('Extracted', ORIGINAL_ROM);
