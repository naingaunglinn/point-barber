import { AttachmentKind } from '@point/shared';
import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';

import {
  type AttachmentRow,
  type Attachments,
  InMemoryStorageService,
  type StorageService,
} from '../../platform/index.js';
import { ReceiptLogo } from './receipt-logo.js';

// add-company-profile task 3.2 — ADR-013 decision 1 (the logo is passed to the renderer inline) ·
// ADR-014 (variants `…/<id>/w800.webp` beside the original) · P8-RULE-04 (the stable path in
// `logo_url`) · design D7: the company logo of a receipt is the `w800.webp` variant of the live
// company image, as a data URI; a missing row or object prints the receipt without the logo and logs
// `receipt.logo_missing` — the receipt is never blocked by the logo.
const A = '0199a3f2-0000-7000-8a00-00000000000a';
const LOGO_URL = `/api/v1/public/media/${A}/original`;
const WEBP = Buffer.from('RIFF....WEBPVP8 logo A');

const row = (overrides: Partial<AttachmentRow> = {}): AttachmentRow => ({
  id: A,
  entity_type: 'companies',
  entity_id: '0199a3f2-0000-7000-8a00-0000000000c0',
  kind: AttachmentKind.IMAGE,
  storage_key: `att/2026/10/${A}/original.png`,
  file_name: 'logo-a.png',
  mime_type: 'image/png',
  size_bytes: 1000,
  uploaded_by_user_id: '0199a3f2-0000-7000-8002-000000000e01',
  uploaded_at: new Date('2026-10-05T09:40:00+06:30'),
  ...overrides,
});

function subject(found: AttachmentRow | null, objects: Record<string, Buffer> = {}) {
  const storage = new InMemoryStorageService();
  for (const [key, body] of Object.entries(objects)) void storage.put(key, body, 'image/webp');
  const asked: string[] = [];
  const attachments = {
    findLive: (id: string) => {
      asked.push(id);
      return Promise.resolve(found);
    },
  } as unknown as Attachments;
  const warnings: { data: unknown; message: string }[] = [];
  const log = {
    warn: (data: unknown, message: string) => warnings.push({ data, message }),
  } as unknown as Logger;
  return { logo: new ReceiptLogo(attachments, storage, log), asked, warnings };
}

describe('ReceiptLogo.load (design D7)', () => {
  it('no logo → null, nothing read', async () => {
    const { logo, asked, warnings } = subject(row());
    expect(await logo.load(null)).toBeNull();
    expect([asked, warnings]).toStrictEqual([[], []]);
  });

  it('the stable path → the live company image → its w800.webp object as a data URI', async () => {
    const { logo, asked, warnings } = subject(row(), { [`att/2026/10/${A}/w800.webp`]: WEBP });
    expect(await logo.load(LOGO_URL)).toStrictEqual({
      dataUri: `data:image/webp;base64,${WEBP.toString('base64')}`,
    });
    expect(asked).toStrictEqual([A]);
    expect(warnings).toStrictEqual([]);
  });

  it('a missing object → null and the warning receipt.logo_missing', async () => {
    const { logo, warnings } = subject(row());
    expect(await logo.load(LOGO_URL)).toBeNull();
    expect(warnings).toStrictEqual([
      { data: { attachment_id: A }, message: 'receipt.logo_missing' },
    ]);
  });

  it('no live row (deleted or unknown) → null and the warning', async () => {
    const { logo, warnings } = subject(null, { [`att/2026/10/${A}/w800.webp`]: WEBP });
    expect(await logo.load(LOGO_URL)).toBeNull();
    expect(warnings).toStrictEqual([
      { data: { attachment_id: A }, message: 'receipt.logo_missing' },
    ]);
  });

  it.each([
    ['a row of another entity', row({ entity_type: 'services' })],
    ['a document, not an image', row({ kind: AttachmentKind.DOCUMENT })],
  ])('%s is not the company logo → null and the warning', async (_, other) => {
    const { logo, warnings } = subject(other, { [`att/2026/10/${A}/w800.webp`]: WEBP });
    expect(await logo.load(LOGO_URL)).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it('a logo_url that is not the stable media path → null and the warning, nothing read', async () => {
    const { logo, asked, warnings } = subject(row());
    expect(await logo.load('https://point.test/logo.png')).toBeNull();
    expect(asked).toStrictEqual([]);
    expect(warnings).toStrictEqual([
      { data: { logo_url: 'https://point.test/logo.png' }, message: 'receipt.logo_missing' },
    ]);
  });

  it('a storage failure other than a missing object is not swallowed', async () => {
    const failing = new ReceiptLogo(
      { findLive: () => Promise.resolve(row()) } as unknown as Attachments,
      {
        getStream: () => Promise.reject(new Error('bucket unreachable')),
      } as unknown as StorageService,
      { warn: () => undefined } as unknown as Logger,
    );
    await expect(failing.load(LOGO_URL)).rejects.toThrow('bucket unreachable');
  });
});
