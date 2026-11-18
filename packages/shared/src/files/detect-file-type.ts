import { AttachmentKind } from '../constants/status.js';
import type { UploadPurpose } from '../shapes.js';

// The type of an upload is read from the file's first bytes, never from its name or its declared type
// (P8-RULE-03 · ADR-014 decision 3 · API-LIM-03 · CG-SEC-08 · add-attachments-upload design D4). A pure
// function over bytes, no dependency; the XLSX test reads the ZIP directory only (nothing is unpacked).

/** The format names of `context.allowed` — the same names as `UPLOAD_TYPES` of `AttachmentUploader`. */
export type FormatName = 'JPEG' | 'PNG' | 'WebP' | 'HEIC' | 'PDF' | 'CSV' | 'XLSX';

const IMAGE_FORMATS = ['JPEG', 'PNG', 'WebP', 'HEIC'] as const satisfies readonly FormatName[];

/** `allowed` of a refusal, per purpose, in the order of the spec (design D4). */
export const UPLOAD_ALLOWED_FORMATS: Readonly<Record<UploadPurpose, readonly FormatName[]>> = {
  image: IMAGE_FORMATS,
  document: [...IMAGE_FORMATS, 'PDF'],
  import: ['CSV', 'XLSX'],
};

/** An accepted file: its format, the mime type and extension it is stored with, and the row `kind`. */
export interface DetectedFileType {
  readonly format: FormatName;
  readonly mime: string;
  readonly ext: string;
  readonly kind: (typeof AttachmentKind)[keyof typeof AttachmentKind];
}

export type DetectResult =
  | { readonly ok: true; readonly type: DetectedFileType }
  | { readonly ok: false; readonly allowed: readonly FormatName[] };

const SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** What each format is stored as — HEIC is converted to JPEG. */
const STORED: Readonly<Record<FormatName, readonly [mime: string, ext: string]>> = {
  JPEG: ['image/jpeg', 'jpg'],
  PNG: ['image/png', 'png'],
  WebP: ['image/webp', 'webp'],
  HEIC: ['image/jpeg', 'jpg'],
  PDF: ['application/pdf', 'pdf'],
  XLSX: [SHEET, 'xlsx'],
  CSV: ['text/csv', 'csv'],
};
const KIND_OF_PURPOSE = {
  image: AttachmentKind.IMAGE,
  document: AttachmentKind.DOCUMENT,
  import: AttachmentKind.IMPORT_FILE,
} as const;

/** Major brands of a HEIC file (bytes 8 - 11 after `ftyp`); `avif` is not among them (design D4). */
const HEIC_BRANDS = 'heic heix hevc hevx heim heis hevm hevs mif1 msf1'.split(' ');

/** The byte at `at`, 0 past the end (a test of a signature never depends on the value). */
const byteAt = (bytes: Uint8Array, at: number): number => bytes[at] ?? 0;

/** `length` bytes from `offset`, one character each, so that a signature is a string. */
const asciiAt = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

/** The format of the signature at offset 0; `ZIP` is a package whose directory is still to be read. */
function signatureOf(bytes: Uint8Array): Exclude<FormatName, 'CSV'> | 'ZIP' | undefined {
  if (asciiAt(bytes, 0, 3) === '\xff\xd8\xff') return 'JPEG';
  if (asciiAt(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'PNG';
  if (asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 4) === 'WEBP') return 'WebP';
  if (asciiAt(bytes, 4, 4) === 'ftyp' && HEIC_BRANDS.includes(asciiAt(bytes, 8, 4))) return 'HEIC';
  if (asciiAt(bytes, 0, 5) === '%PDF-') return 'PDF';
  if (asciiAt(bytes, 0, 4) === 'PK\x03\x04') return 'ZIP';
  return undefined;
}

/**
 * True when the ZIP central directory lists `xl/workbook.xml`: the end record is searched from the
 * back (22 bytes + a comment of at most 65,535), then the entry names are read; no entry is
 * decompressed, and a damaged or cut-off directory is "not found".
 */
function zipListsWorkbook(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The search stops where the longest comment would begin, so a 10 MB file is not walked byte by byte.
  const floor = Math.max(0, bytes.length - 22 - 0xffff);
  let end = bytes.length - 22;
  while (end >= floor && asciiAt(bytes, end, 4) !== 'PK\x05\x06') end -= 1;
  if (end < floor) return false;
  let at = view.getUint32(end + 16, true);
  if (at + view.getUint32(end + 12, true) > end) return false;
  for (let entry = view.getUint16(end + 10, true); entry > 0; entry -= 1) {
    if (at + 46 > end || asciiAt(bytes, at, 4) !== 'PK\x01\x02') return false;
    const name = view.getUint16(at + 28, true);
    const skip = view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    if (at + 46 + name > end) return false;
    if (asciiAt(bytes, at + 46, name) === 'xl/workbook.xml') return true;
    at += 46 + name + skip;
  }
  return false;
}

/** Well-formed UTF-8 (RFC 3629): no overlong form, no surrogate, nothing above U+10FFFF. */
function isUtf8(bytes: Uint8Array): boolean {
  let at = 0;
  while (at < bytes.length) {
    const first = byteAt(bytes, at);
    const extra = first < 0x80 ? 0 : first < 0xc2 ? -1 : first < 0xe0 ? 1 : first < 0xf0 ? 2 : 3;
    if (extra < 0 || at + extra >= bytes.length) return false;
    let value = extra === 0 ? first : first & (0x3f >> extra);
    for (let index = 1; index <= extra; index += 1) {
      const next = byteAt(bytes, at + index);
      if ((next & 0xc0) !== 0x80) return false;
      value = (value << 6) | (next & 0x3f);
    }
    const lowest = [0, 0x80, 0x800, 0x10000][extra] ?? 0;
    if (value < lowest || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return false;
    at += extra + 1;
  }
  return true;
}

/** UTF-16 with a byte-order mark (FF FE or FE FF) and a whole number of 16-bit units. */
const isUtf16WithBom = (bytes: Uint8Array): boolean =>
  bytes.length % 2 === 0 && ['\xff\xfe', '\xfe\xff'].includes(asciiAt(bytes, 0, 2));

/**
 * The type of `bytes` for an upload of `purpose` (design D4): the signature at offset 0, then the
 * purpose gate. The CSV text test — UTF-8 (a byte-order mark allowed) without a NUL byte, or UTF-16
 * with a byte-order mark — runs only for `purpose = import` and only when no binary signature
 * matched, so an image or a PDF never falls through to "text". An empty file is refused; a refusal
 * carries the `allowed` format names of the purpose.
 */
export function detectFileType(bytes: Uint8Array, purpose: UploadPurpose): DetectResult {
  const allowed = UPLOAD_ALLOWED_FORMATS[purpose];
  const signature = signatureOf(bytes);
  const isCsv =
    purpose === 'import' &&
    bytes.length > 0 &&
    signature === undefined &&
    (isUtf16WithBom(bytes) || (!bytes.includes(0) && isUtf8(bytes)));
  const detected = signature === 'ZIP' ? (zipListsWorkbook(bytes) ? 'XLSX' : undefined) : signature;
  const format = detected ?? (isCsv ? 'CSV' : undefined);
  if (format === undefined || !allowed.includes(format)) return { ok: false, allowed };
  const [mime, ext] = STORED[format];
  return { ok: true, type: { format, mime, ext, kind: KIND_OF_PURPOSE[purpose] } };
}
