import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  ATTACHMENT_VARIANTS,
  UPLOAD_PURPOSES,
  attachmentListQuerySchema,
  attachmentSchema,
  attachmentUploadSchema,
  removeRequestSchema,
  urlQuerySchema,
} from './attachments.js';

// add-attachments-upload task 1.4 — "Any signed-in staff member uploads one file ...", P8.ATT.01 - 05 ·
// CG-API-03 · API-ERR-03: `errors[].code` is the Zod issue name (too_big, invalid_value, invalid_type).

function issuesOf(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues;
}
const name = (length: number) => 'a'.repeat(length - 4) + '.jpg';

describe('attachmentUploadSchema (P8.ATT.01)', () => {
  it('a file name of 255 characters passes, 256 is one too_big issue on file', () => {
    expect(attachmentUploadSchema.safeParse({ file: name(255), purpose: 'image' }).success).toBe(
      true,
    );
    expect(issuesOf(attachmentUploadSchema, { file: name(256), purpose: 'image' })).toMatchObject([
      { code: 'too_big', path: ['file'], maximum: 255 },
    ]);
  });

  it('purposes image, document and import pass; video is invalid_value, a missing file is invalid_type, an empty name too_small', () => {
    for (const purpose of UPLOAD_PURPOSES)
      expect(attachmentUploadSchema.safeParse({ file: 'a.png', purpose }).success).toBe(true);
    expect(issuesOf(attachmentUploadSchema, { file: 'a.mp4', purpose: 'video' })).toMatchObject([
      { code: 'invalid_value', path: ['purpose'] },
    ]);
    expect(issuesOf(attachmentUploadSchema, { purpose: 'image' })).toMatchObject([
      { code: 'invalid_type', path: ['file'] },
    ]);
    expect(issuesOf(attachmentUploadSchema, { file: '', purpose: 'image' })).toMatchObject([
      { code: 'too_small', path: ['file'] },
    ]);
  });

  it('w300 is invalid_value; download is the text true or false, read as a boolean', () => {
    expect(ATTACHMENT_VARIANTS).toEqual(['original', 'w400', 'w800', 'w1600']);
    expect(issuesOf(urlQuerySchema, { variant: 'w300' })).toMatchObject([
      { code: 'invalid_value', path: ['variant'] },
    ]);
    expect(urlQuerySchema.parse({ download: 'true' })).toEqual({ download: true });
    expect(issuesOf(urlQuerySchema, { download: 'yes' })).toMatchObject([{ path: ['download'] }]);
  });
});

const LOGO = {
  id: '0198a000-0000-7000-8000-00000000a001',
  entity_type: 'uploads',
  entity_id: '0198a000-0000-7000-8000-0000000000a3',
  kind: 2,
  file_name: 'logo-a.png',
  mime_type: 'image/png',
  size_bytes: 24_000,
  image: { width: 600, height: 600, variants: ['original', 'w400'] },
  staging: true,
  expires_at: '2026-10-06T10:05:00+06:30',
  uploaded_by: { user_id: '0198a000-0000-7000-8000-0000000000a3', display_name: 'Ko Aung' },
  uploaded_at: '2026-10-05T10:05:00+06:30',
  deleted_at: null,
};

describe('attachmentSchema (P8.ATT.01 - 03)', () => {
  it('accepts the response of the logo scenario and a linked document (image null)', () => {
    expect(attachmentSchema.parse(LOGO)).toEqual(LOGO);
    const pdf = { ...LOGO, kind: 1, mime_type: 'application/pdf', image: null, expires_at: null };
    expect(attachmentSchema.safeParse(pdf).success).toBe(true);
  });

  it('is strict: storage_key and a url are unrecognized keys', () => {
    expect(issuesOf(attachmentSchema, { ...LOGO, storage_key: 'att/x' })).toMatchObject([
      { code: 'unrecognized_keys', keys: ['storage_key'] },
    ]);
    expect(issuesOf(attachmentSchema, { ...LOGO, url: 'https://bucket.example/x' })).toMatchObject([
      { code: 'unrecognized_keys', keys: ['url'] },
    ]);
  });

  it('has the thirteen members of Part 8, none for a key or a URL', () => {
    const members = Object.keys(attachmentSchema.shape);
    expect(members.filter((member) => /url|link|key/.test(member))).toEqual([]);
    expect(members).toHaveLength(13);
  });

  it('refuses a kind outside 1 / 2 / 3 and a variant outside the four', () => {
    expect(attachmentSchema.safeParse({ ...LOGO, kind: 4 }).success).toBe(false);
    const image = { width: 600, height: 600, variants: ['w300'] };
    expect(attachmentSchema.safeParse({ ...LOGO, image }).success).toBe(false);
  });
});

describe('attachmentListQuerySchema (P8.ATT.02)', () => {
  const ID = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';

  it('takes an entity type and a uuid; a missing member or a bad uuid is refused', () => {
    expect(
      attachmentListQuerySchema.safeParse({ entity_type: 'uploads', entity_id: ID }).success,
    ).toBe(true);
    expect(issuesOf(attachmentListQuerySchema, { entity_id: ID })).toMatchObject([
      { code: 'invalid_type', path: ['entity_type'] },
    ]);
    expect(
      issuesOf(attachmentListQuerySchema, { entity_type: 'uploads', entity_id: 'abc' }),
    ).toMatchObject([{ path: ['entity_id'] }]);
  });
});
