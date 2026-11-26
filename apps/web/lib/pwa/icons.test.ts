import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import fixture from '../../test/fixtures/pwa-colours.json';
import { ICON_FILES } from './manifest';
import { tokenHex } from './token-colour';
import { readTokenCss } from './token-file';

// add-pwa-install task 1.3 · spec "The app icons are placeholders until the owner's logo arrives" · PW1 · ADR-003.
const ICON_DIR = join(import.meta.dirname, '../../public/icons');
const SIZES: Readonly<Record<string, number>> = {
  [ICON_FILES.any192]: 192,
  [ICON_FILES.any512]: 512,
  [ICON_FILES.maskable512]: 512,
  [ICON_FILES.appleTouch]: 180,
};

/** The width, height and RGB pixels of an 8-bit RGB PNG made of one IDAT chunk or more. */
function decode(bytes: Buffer) {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const data: Buffer[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    if (bytes.toString('latin1', at + 4, at + 8) === 'IDAT') {
      data.push(bytes.subarray(at + 8, at + 8 + length));
    }
    at += 12 + length;
  }
  return {
    width,
    height,
    bitDepth: bytes[24],
    colourType: bytes[25],
    raw: inflateSync(Buffer.concat(data)),
  };
}

describe('the placeholder icons (PW1)', () => {
  it.each(Object.entries(SIZES))(
    '%s is a plain square of its size in the --primary colour',
    (src, size) => {
      const png = decode(readFileSync(join(ICON_DIR, src.replace('/icons/', ''))));
      expect([png.width, png.height, png.bitDepth, png.colourType]).toEqual([size, size, 8, 2]);
      const expected = fixture.colours.neutral.hex;
      expect(tokenHex(readTokenCss(), '--primary')).toBe(expected);
      const colour = [1, 3, 5].map((at) => Number.parseInt(expected.slice(at, at + 2), 16));
      const stride = 1 + size * 3;
      expect(png.raw).toHaveLength(stride * size);
      for (let y = 0; y < size; y += 1) {
        const row = png.raw.subarray(y * stride, (y + 1) * stride);
        expect(row[0]).toBe(0); // no filter
        const pixels = row.subarray(1);
        let wrong = 0;
        for (let x = 0; x < size * 3; x += 1) if (pixels[x] !== colour[x % 3]) wrong += 1;
        expect(wrong).toBe(0);
      }
    },
  );

  it('the folder holds exactly the four files of the manifest and the page head', () => {
    expect(readdirSync(ICON_DIR).sort()).toEqual(
      Object.keys(SIZES)
        .map((src) => src.replace('/icons/', ''))
        .sort(),
    );
  });

  it('the script writes the committed files again, byte for byte', () => {
    const out = mkdtempSync(join(tmpdir(), 'point-icons-'));
    try {
      execFileSync(
        process.execPath,
        [join(import.meta.dirname, '../../scripts/placeholder-icons.mjs'), `--out=${out}`],
        { stdio: 'ignore' },
      );
      for (const name of readdirSync(ICON_DIR)) {
        expect(readFileSync(join(out, name)).equals(readFileSync(join(ICON_DIR, name)))).toBe(true);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
