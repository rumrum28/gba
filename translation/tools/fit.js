// Dry-run inserts script files into a copy of the clean ROM and reports whether each fits its slot.
// Usage: node tools/fit.js <script.txt> [...more]   (offset is taken from the file name)
const { execFileSync } = require('child_process');
const { fs, path } = require('./lib');

const UP = path.join(__dirname, '..', 'upstream', 'StoneOfBeginnings');
const exe = path.join(UP, 'script_inserter', 'swordcraft3c.exe');
const rom = path.join(UP, 'swordcraft3-test.gba'); // must exist: run the build once first

for (const f of process.argv.slice(2)) {
  const pos = path.basename(f, '.txt');
  let out;
  try {
    out = execFileSync(exe, [rom, path.resolve(f), `--pos=${pos}`, '--dry-run'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  // Success prints "Compressed: <slot> bytes => <new> bytes"; overflow prints "<new> bytes out of <slot> bytes".
  const ok = out.match(/Compressed: (\d+) bytes => (\d+) bytes/);
  const big = out.match(/(\d+) bytes out of (\d+)/);
  const [used, slot] = ok ? [+ok[2], +ok[1]] : big ? [+big[1], +big[2]] : [];
  const verdict = out.includes('No errors found') && !big ? 'OK' : 'FAIL';
  const size = slot ? `${used}/${slot} (${slot - used} spare)` : '';
  console.log(`${verdict}\t${pos}\t${size}${verdict === 'FAIL' ? '\t' + out.trim().split('\n').slice(-1)[0] : ''}`);
}
