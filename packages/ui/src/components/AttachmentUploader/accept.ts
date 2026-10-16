import type { UploadPurpose } from '@point/shared';

// The types an upload purpose accepts (design D10 · P8.ATT.01): image = JPEG, PNG, WebP, HEIC ·
// document = the image types + PDF · import = CSV, XLSX — and the size limit in bytes (maxMb ×
// 1,048,576). This is the pre-check before an upload starts; the server remains the authority
// (magic bytes, `system.upload_max_mb` — API-LIM-03).

interface FileType {
  /** The format name shown in the hint. */
  readonly name: string;
  readonly mime: readonly string[];
  readonly extensions: readonly string[];
}

const JPEG: FileType = { name: 'JPEG', mime: ['image/jpeg'], extensions: ['.jpg', '.jpeg'] };
const PNG: FileType = { name: 'PNG', mime: ['image/png'], extensions: ['.png'] };
const WEBP: FileType = { name: 'WebP', mime: ['image/webp'], extensions: ['.webp'] };
const HEIC: FileType = { name: 'HEIC', mime: ['image/heic'], extensions: ['.heic'] };
const PDF: FileType = { name: 'PDF', mime: ['application/pdf'], extensions: ['.pdf'] };
const CSV: FileType = { name: 'CSV', mime: ['text/csv'], extensions: ['.csv'] };
const XLSX: FileType = {
  name: 'XLSX',
  mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  extensions: ['.xlsx'],
};

const IMAGE_TYPES = [JPEG, PNG, WEBP, HEIC] as const;

export const UPLOAD_TYPES: Readonly<Record<UploadPurpose, readonly FileType[]>> = {
  image: IMAGE_TYPES,
  document: [...IMAGE_TYPES, PDF],
  import: [CSV, XLSX],
};

export const BYTES_PER_MB = 1_048_576;

/** `JPEG, PNG, WebP, HEIC` — the format names of a purpose, for the hint and the type message. */
export const typeNames = (purpose: UploadPurpose) =>
  UPLOAD_TYPES[purpose].map((type) => type.name).join(', ');

/** The `accept` attribute of the file input. */
export const acceptAttribute = (purpose: UploadPurpose) =>
  UPLOAD_TYPES[purpose].flatMap((type) => [...type.mime, ...type.extensions]).join(',');

/**
 * A file the purpose accepts — by its extension or its reported type (a browser may report a CSV as
 * `application/vnd.ms-excel`, or no type at all for HEIC).
 */
export function isAllowedType(file: Pick<File, 'name' | 'type'>, purpose: UploadPurpose): boolean {
  const name = file.name.toLowerCase();
  return UPLOAD_TYPES[purpose].some(
    (type) =>
      type.extensions.some((extension) => name.endsWith(extension)) ||
      type.mime.includes(file.type),
  );
}

/** At most `maxMb × 1,048,576` bytes: 10 MB allows 10,485,760 bytes and refuses 10,485,761. */
export const isWithinLimit = (file: Pick<File, 'size'>, maxMb: number) =>
  file.size <= maxMb * BYTES_PER_MB;
