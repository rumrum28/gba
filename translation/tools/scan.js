// Lists PSI3 script blocks in both ROMs and pairs them by position.
const { fs, PATCHED_ROM, ORIGINAL_ROM, findScriptBlocks, hex } = require('./lib');

const orig = findScriptBlocks(fs.readFileSync(ORIGINAL_ROM));
const pat = findScriptBlocks(fs.readFileSync(PATCHED_ROM));
console.log('original blocks:', orig.length, 'patched blocks:', pat.length);
const byOff = new Map(orig.map(b => [b.offset, b]));
let same = 0, changed = 0, moved = 0;
for (const b of pat) {
  const o = byOff.get(b.offset);
  if (!o) moved++; else if (o.data.equals(b.data)) same++; else changed++;
}
console.log({ unchangedInPlace: same, changedInPlace: changed, notAtOriginalOffset: moved });
console.log('orig range', hex(orig[0].offset), '-', hex(orig.at(-1).compEnd), ' patched range', hex(pat[0].offset), '-', hex(pat.at(-1).compEnd));
