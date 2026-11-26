// Writes the four placeholder app icons into public/icons (add-pwa-install task 1.3 · design D3 · PW1 ·
// ADR-003 action item 2): a plain square in the `--primary` colour of packages/ui/tokens.css — no letter,
// mark or picture — until the owner supplies the logo. The owner's files replace these four under the same
// names; this script is not run by the build, and the PNGs are committed.
//   node scripts/placeholder-icons.mjs [--out=<dir>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

import { tokenHex } from '../lib/pwa/token-colour.ts';

const here = dirname(fileURLToPath(import.meta.url));
const TOKENS = resolve(here, '../../../packages/ui/tokens.css');

/** The icons: file name → side in pixels. The maskable one is full-bleed, so its safe zone is trivially met. */
export const ICONS = {
  'icon-192.png': 192,
  'icon-512.png': 512,
  'icon-maskable-512.png': 512,
  'apple-touch-icon.png': 180,
};

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A `size` × `size` 8-bit RGB PNG, every pixel `hex` (`#rrggbb`). */
export function encodePng(size, hex) {
  const rgb = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: size }, () => rgb).flat()),
  ]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, deflate, no filter method, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((value) => value.startsWith('--out='));
  const out = arg ? resolve(arg.slice('--out='.length)) : join(here, '../public/icons');
  const colour = tokenHex(readFileSync(TOKENS, 'utf8'), '--primary');
  mkdirSync(out, { recursive: true });
  for (const [name, size] of Object.entries(ICONS))
    writeFileSync(join(out, name), encodePng(size, colour));
  console.log(`placeholder-icons: ${Object.keys(ICONS).length} PNG files (${colour}) → ${out}`);
}
