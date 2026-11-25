import { describe, expect, it } from 'vitest';

import { AttachmentKind } from '../constants/status.js';
import type { UploadPurpose } from '../shapes.js';
import { UPLOAD_ALLOWED_FORMATS, detectFileType } from './detect-file-type.js';

// add-attachments-upload task 1.6 — "The type is read from the file's first bytes ..." · "CSV has no
// signature ..." · AT2 · P8-RULE-03 R3-19 · design D4. Every file is built in code (design D15).

type Part = number | readonly number[];
const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));
const bytes = (...parts: Part[]): Uint8Array => Uint8Array.from(parts.flat());
const zeros = (length: number): number[] => new Array<number>(length).fill(0);
const pad = zeros(16).fill(0x20);
const u16 = (value: number) => [value & 0xff, value >> 8];
const u32 = (value: number) => [...u16(value & 0xffff), ...u16(value >>> 16)];

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, pad);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, pad);
const WEBP = bytes(ascii('RIFF'), u32(36), ascii('WEBPVP8 '), pad);
const heic = (brand: string) => bytes(0, 0, 0, 24, ascii('ftyp'), ascii(brand), zeros(4), pad);
const PDF = bytes(ascii('%PDF-1.7\n'), pad);
const GIF = bytes(ascii('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0);
const CSV_TEXT = 'name,phone\nMa Su,09 400 000 222\n';
const CSV = bytes(ascii(CSV_TEXT));

/** A ZIP of the given names: a local header, the central directory, the end record (no entry data). */
function zip(names: string[], comment = 0): Uint8Array {
  const local = ascii('PK\x03\x04');
  const entry = (name: string) => [
    ...ascii('PK\x01\x02'),
    ...zeros(24),
    ...u16(name.length),
    ...zeros(16),
    ...ascii(name),
  ];
  const directory = names.flatMap(entry);
  const end = [...ascii('PK\x05\x06'), ...zeros(4), ...u16(names.length), ...u16(names.length)];
  return bytes(
    local,
    zeros(26),
    directory,
    end,
    u32(directory.length),
    u32(30),
    u16(comment),
    zeros(comment),
  );
}
const XLSX = zip(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);

const IMAGE = ['JPEG', 'PNG', 'WebP', 'HEIC'];
const ALLOWED = { image: IMAGE, document: [...IMAGE, 'PDF'], import: ['CSV', 'XLSX'] };
const KIND = {
  image: AttachmentKind.IMAGE,
  document: AttachmentKind.DOCUMENT,
  import: AttachmentKind.IMPORT_FILE,
};
const SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// format, file, stored mime, stored extension (HEIC is stored as JPEG)
const FORMATS = [
  ['JPEG', JPEG, 'image/jpeg', 'jpg'],
  ['PNG', PNG, 'image/png', 'png'],
  ['WebP', WEBP, 'image/webp', 'webp'],
  ['HEIC', heic('heic'), 'image/jpeg', 'jpg'],
  ['PDF', PDF, 'application/pdf', 'pdf'],
  ['XLSX', XLSX, SHEET, 'xlsx'],
  ['CSV', CSV, 'text/csv', 'csv'],
] as const;
const refused = (purpose: UploadPurpose) => ({ ok: false, allowed: ALLOWED[purpose] });

describe('detectFileType', () => {
  it('the allowed lists are the constants of the spec, in its order', () => {
    expect(UPLOAD_ALLOWED_FORMATS).toEqual(ALLOWED);
  });

  describe.each(['image', 'document', 'import'] as const)('purpose %s', (purpose) => {
    it.each(FORMATS)(
      '%s is accepted with its stored type and kind, or refused',
      (format, file, mime, ext) => {
        const accepted = ALLOWED[purpose].includes(format);
        expect(detectFileType(file, purpose)).toEqual(
          accepted
            ? { ok: true, type: { format, mime, ext, kind: KIND[purpose] } }
            : refused(purpose),
        );
      },
    );

    it.each([
      ['an empty file', new Uint8Array()],
      ['GIF89a', GIF],
      ['AVIF (ftyp avif)', heic('avif')],
      ['a ZIP without xl/workbook.xml', zip(['docs/readme.txt'])],
      ['a file shorter than its signature', bytes(0xff, 0xd8)],
      ['RIFF that is not WEBP', bytes(ascii('RIFF'), u32(36), ascii('WAVEfmt '), pad)],
    ])('%s is refused', (_name, file) => {
      expect(detectFileType(file, purpose)).toEqual(refused(purpose));
    });
  });

  it.each('heic heix hevc hevx heim heis hevm hevs mif1 msf1 isom avif'.split(' '))(
    'major brand %s',
    (brand) => {
      expect(detectFileType(heic(brand), 'image').ok).toBe(!['isom', 'avif'].includes(brand));
    },
  );

  describe('CSV text test (purpose import only)', () => {
    const csv = (...parts: Part[]) => detectFileType(bytes(...parts), 'import');
    const type = { format: 'CSV', mime: 'text/csv', ext: 'csv', kind: AttachmentKind.IMPORT_FILE };
    const utf16 = (little: boolean) =>
      [...'name,phone'].flatMap((c) => (little ? [c.charCodeAt(0), 0] : [0, c.charCodeAt(0)]));

    it('UTF-8 with and without a byte-order mark, Myanmar text, UTF-16 in both orders', () => {
      expect(CSV.length).toBe(32);
      expect(csv(ascii(CSV_TEXT))).toEqual({ ok: true, type });
      expect(csv(0xef, 0xbb, 0xbf, ascii(CSV_TEXT))).toEqual({ ok: true, type });
      expect(csv(0xff, 0xfe, utf16(true))).toEqual({ ok: true, type });
      expect(csv(0xfe, 0xff, utf16(false))).toEqual({ ok: true, type });
      expect(csv([...new TextEncoder().encode('အမည်,ဖုန်း\n')])).toEqual({ ok: true, type });
      expect(csv([0xf4, 0x8f, 0xbf, 0xbf])).toEqual({ ok: true, type }); // U+10FFFF, the last one
      expect(csv([0xff, 0xfe, 0x3d, 0xd8, 0x00, 0xde])).toEqual({ ok: true, type }); // U+1F600, a pair
    });

    it.each([
      ['a NUL byte and no UTF-16 mark', [...ascii('name,phone'), 0, ...ascii('Ma Su')]],
      ['bytes that are not UTF-8 (C3 28)', [...ascii('name,phone'), 0xc3, 0x28]],
      ['an overlong form (C0 80)', [0xc0, 0x80]],
      ['a surrogate in UTF-8 (ED A0 80)', [0xed, 0xa0, 0x80]],
      ['a value above U+10FFFF (F5 80 80 80)', [0xf5, 0x80, 0x80, 0x80]],
      ['a lead byte that does not exist (F8)', [0xf8, 0x90, 0x80, 0x80]],
      ['a lead byte that does not exist (FC)', [0xfc, 0x80, 0x80, 0x80]],
      ['a sequence cut off (E1 80)', [0xe1, 0x80]],
      ['a stray continuation byte (80)', [0x80]],
      ['UTF-16 with an odd length', [0xff, 0xfe, 0x6e]],
      ['UTF-16 with a high surrogate alone', [0xff, 0xfe, 0x00, 0xd8, 0x41, 0x00]],
      ['UTF-16 with a low surrogate alone', [0xff, 0xfe, 0x00, 0xdc, 0x41, 0x00]],
      ['UTF-16 that ends in a high surrogate', [0xfe, 0xff, 0x00, 0x41, 0xd8, 0x00]],
      ['UTF-16 with U+0000 (binary after the mark)', [0xff, 0xfe, 0x4d, 0x5a, 0x00, 0x00]],
    ])('%s is refused', (_name, content) => {
      expect(csv(content)).toEqual(refused('import'));
    });

    it('a JPEG or PDF body is not text for an import; text is no CSV for the other purposes', () => {
      expect(detectFileType(JPEG, 'import')).toEqual(refused('import'));
      expect(detectFileType(PDF, 'import')).toEqual(refused('import'));
      const svg = bytes(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'));
      for (const purpose of ['image', 'document'] as const) {
        expect(detectFileType(CSV, purpose)).toEqual(refused(purpose));
        expect(detectFileType(svg, purpose)).toEqual(refused(purpose));
      }
    });
  });

  describe('XLSX is a ZIP whose directory lists xl/workbook.xml (no entry is decompressed)', () => {
    it('is found behind a ZIP comment; a longer name does not count', () => {
      expect(detectFileType(zip(['xl/workbook.xml'], 200), 'import').ok).toBe(true);
      expect(detectFileType(zip(['xl/workbook.xml.bak']), 'import')).toEqual(refused('import'));
    });

    it('a cut-off ZIP or a directory that points outside the file is refused, not thrown', () => {
      expect(detectFileType(XLSX.slice(0, 40), 'import')).toEqual(refused('import'));
      const broken = Uint8Array.from(XLSX);
      broken.set([0xff, 0xff, 0, 0], broken.length - 6); // offset of the central directory
      expect(detectFileType(broken, 'import')).toEqual(refused('import'));
    });
  });
});
