import { AttachmentKind, attachmentSchema } from '@point/shared';
import { describe, expect, it } from 'vitest';

import type { AttachmentRow } from '../repositories/attachments.repository.js';
import { toAttachment } from './attachment-dto.js';

// add-attachments-upload task 3.6 / 3.7 — "The picture's size is stored on the row and every read of
// `image` comes from it" (AT8 · design D6): the mapper builds `Attachment` from the row alone, and has no
// member for the storage key or a URL.

const AUNG = '0199a3f2-0000-7000-8002-000000000e04';
const row = (overrides: Partial<AttachmentRow> = {}): AttachmentRow => ({
  id: '0199a3f2-0000-7000-8a00-00000000000a',
  entity_type: 'uploads',
  entity_id: AUNG,
  kind: AttachmentKind.IMAGE,
  storage_key: 'att/2026/10/0199a3f2-0000-7000-8a00-00000000000a/original.png',
  file_name: 'logo-a.png',
  mime_type: 'image/png',
  size_bytes: 24_000,
  uploaded_by_user_id: AUNG,
  uploaded_at: new Date('2026-10-05T10:05:00+06:30'),
  image_width: 600,
  image_height: 600,
  ...overrides,
});

describe('toAttachment', () => {
  it('Scenario: A barber uploads a logo — the members of the spec, no storage key and no URL', () => {
    const dto = toAttachment(row(), 'Ko Aung');
    expect(attachmentSchema.parse(dto)).toStrictEqual({
      id: '0199a3f2-0000-7000-8a00-00000000000a',
      entity_type: 'uploads',
      entity_id: AUNG,
      kind: 2,
      file_name: 'logo-a.png',
      mime_type: 'image/png',
      size_bytes: 24_000,
      image: { width: 600, height: 600, variants: ['original', 'w400'] },
      staging: true,
      expires_at: '2026-10-06T10:05:00+06:30',
      uploaded_by: { user_id: AUNG, display_name: 'Ko Aung' },
      uploaded_at: '2026-10-05T10:05:00+06:30',
      deleted_at: null,
    });
    expect(JSON.stringify(dto)).not.toMatch(/storage_key|att\/2026|https?:/);
  });

  it('image comes from the row: 2560 × 1920 has all four variants, 800 × 400 has w800 (equal width), 399 none', () => {
    const variants = (width: number, height: number) =>
      toAttachment(row({ image_width: width, image_height: height }), '').image?.variants;
    expect(variants(2560, 1920)).toStrictEqual(['original', 'w400', 'w800', 'w1600']);
    expect(variants(800, 400)).toStrictEqual(['original', 'w400', 'w800']);
    expect(variants(399, 300)).toStrictEqual(['original']);
  });

  it('a file without a size is image null — a PDF, and a generated receipt PNG that keeps no size', () => {
    const pdf = row({
      kind: 1,
      mime_type: 'application/pdf',
      image_width: null,
      image_height: null,
    });
    expect(toAttachment(pdf, '').image).toBeNull();
    expect(toAttachment(row({ image_width: null, image_height: null }), '').image).toBeNull();
  });

  it('a linked row is not staging: expires_at null', () => {
    const linked = toAttachment(row({ entity_type: 'companies' }), '');
    expect([linked.staging, linked.expires_at]).toStrictEqual([false, null]);
  });

  it('a kind outside 1 / 2 / 3 is a defect, not a case to map', () => {
    expect(() => toAttachment(row({ kind: 4 }), '')).toThrow('not a kind');
  });
});
