// Shared helpers for the SNSS3 translation tools.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const GAMES = path.join(ROOT, 'games');
const PATCHED_ROM = path.join(GAMES, 'Summon Night - Craft Sword Monogatari - Hajimari no Ishi (Japan) (patched).gba');
const WORK = path.join(__dirname, '..', 'work');
const BUILD = path.join(__dirname, '..', 'build');
const ORIGINAL_ROM = path.join(WORK, 'original.gba'); // extracted from the zip by tools/setup.js

const sjis = new TextDecoder('shift_jis');

// GBA BIOS LZ77 (type 0x10). Returns { data, end } or null if the stream is not valid.
function lzDecompress(buf, p, maxSize = 0x40000) {
  if (buf[p] !== 0x10) return null;
  const size = buf[p + 1] | (buf[p + 2] << 8) | (buf[p + 3] << 16);
  if (size === 0 || size > maxSize) return null;
  const out = Buffer.alloc(size);
  let op = 0, ip = p + 4;
  while (op < size) {
    if (ip >= buf.length) return null;
    const flags = buf[ip++];
    for (let k = 0; k < 8 && op < size; k++) {
      if (flags & (0x80 >> k)) {
        const x = (buf[ip] << 8) | buf[ip + 1];
        ip += 2;
        const len = (x >> 12) + 3, dist = (x & 0xfff) + 1;
        if (dist > op) return null;
        for (let m = 0; m < len && op < size; m++, op++) out[op] = out[op - dist];
      } else {
        out[op++] = buf[ip++];
      }
    }
  }
  return { data: out, end: ip };
}

// GBA-compatible LZ77 compressor (greedy, VRAM-safe: minimum distance 2).
function lzCompress(src) {
  const out = [0x10, src.length & 0xff, (src.length >> 8) & 0xff, (src.length >> 16) & 0xff];
  let ip = 0;
  while (ip < src.length) {
    const flagPos = out.length;
    out.push(0);
    let flags = 0;
    for (let k = 0; k < 8 && ip < src.length; k++) {
      let bestLen = 0, bestDist = 0;
      const maxDist = Math.min(0x1000, ip);
      for (let d = 2; d <= maxDist; d++) {
        let l = 0;
        while (l < 18 && ip + l < src.length && src[ip + l] === src[ip + l - d]) l++;
        if (l > bestLen) { bestLen = l; bestDist = d; if (l === 18) break; }
      }
      if (bestLen >= 3) {
        flags |= 0x80 >> k;
        const x = ((bestLen - 3) << 12) | (bestDist - 1);
        out.push(x >> 8, x & 0xff);
        ip += bestLen;
      } else {
        out.push(src[ip++]);
      }
    }
    out[flagPos] = flags;
  }
  while (out.length % 4) out.push(0);
  return Buffer.from(out);
}

// Find every LZ77 stream in [start, end) that decompresses to a PSI3 script.
function findScriptBlocks(rom, start = 0, end = rom.length) {
  const blocks = [];
  for (let p = start; p < end - 8; p += 4) { // GBA LZ data is 4-byte aligned
    if (rom[p] !== 0x10) continue;
    const r = lzDecompress(rom, p);
    if (!r || r.data.toString('latin1', 0, 4) !== 'PSI3') continue;
    blocks.push({ offset: p, compEnd: r.end, data: r.data });
    p = ((r.end + 3) & ~3) - 4;
  }
  return blocks;
}

const hex = (n, w = 7) => '0x' + n.toString(16).toUpperCase().padStart(w, '0');

module.exports = { fs, path, ROOT, GAMES, PATCHED_ROM, ORIGINAL_ROM, WORK, BUILD, sjis, lzDecompress, lzCompress, findScriptBlocks, hex };
