import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ErrorCode, UiLanguage, attachmentSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AttachmentsRepository } from '../src/modules/platform/repositories/attachments.repository.js';
import { InMemoryStorageService, StorageService } from '../src/modules/platform/index.js';
import { gradientImage, padTo } from './helpers/test-images.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';
import { storeSetting } from './helpers/settings.js';

// add-attachments-upload tasks 3.4 / 3.5 — POST /v1/attachments (P8.ATT.01 · P8-RULE-03 · ADR-014 · CG-DB-10):
// the response members, the size limit in bytes and its place before the type, the type read from the
// bytes, the Zawgyi name, the fixed key, and the objects and the row written (and removed) together.
// Real MinIO for the bucket; the clock is the spec's 05/Oct/2026 10:05 AM.
const AUNG: FixturePerson = 'E004';
const MIN: FixturePerson = 'E005';
const ZIN: FixturePerson = 'E001';
const MB10 = 10 * 1_048_576;
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/images');

let s: SeededApp;
let storage: StorageService;
let jpeg: Buffer;
let png600: Buffer;
const PDF = padTo(Buffer.from('%PDF-1.7\n'), 153_600);
const CSV = Buffer.from('name,phone\nMa Su,09 400 000 222\n');

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:05:00+06:30'));
  // `display_name` is the employee's name in the caller's language (AD-L10N-03); the scenarios read Ko Aung in English.
  await s.prisma.users.update({
    where: { id: FIXTURE_IDS.users[AUNG] },
    data: { ui_language: UiLanguage.EN },
  });
  storage = s.app.get(StorageService);
  jpeg = await gradientImage('jpeg', 800, 400, { gps: true });
  png600 = await gradientImage('png', 600, 600);
}, 90_000);
afterAll(() => s.close());

interface Sent {
  readonly name?: string;
  readonly type?: string;
  readonly purpose?: string;
  readonly who?: FixturePerson;
}

/** `POST /v1/attachments` as the staff app sends it; `file` null sends no file part. */
async function upload(file: Buffer | null, sent: Sent = {}): Promise<Response> {
  const { cookie } = await s.signIn(sent.who ?? AUNG);
  let request = s.http.post('/api/v1/attachments').set('Cookie', cookie);
  request = request.field('purpose', sent.purpose ?? 'image');
  if (file !== null) {
    request = request.attach('file', file, {
      filename: sent.name ?? 'upload.bin',
      contentType: sent.type ?? 'application/octet-stream',
    });
  }
  return request;
}

const stored = (id: string) => s.prisma.attachments.findUniqueOrThrow({ where: { id } });
const count = () => s.prisma.attachments.count();

describe('Scenario: success — the exact response members', () => {
  it('A barber uploads a logo image: logo-a.png 600 × 600 → 201, the row and two objects', async () => {
    const before = await count();
    const res = await upload(png600, { name: 'logo-a.png', type: 'image/png' });
    expect(res.status).toBe(201);
    const body = attachmentSchema.parse(res.body);
    expect(body).toStrictEqual({
      id: body.id,
      entity_type: 'uploads',
      entity_id: FIXTURE_IDS.users[AUNG],
      kind: 2,
      file_name: 'logo-a.png',
      mime_type: 'image/png',
      size_bytes: Number((await stored(body.id)).size_bytes),
      image: { width: 600, height: 600, variants: ['original', 'w400'] },
      staging: true,
      expires_at: '2026-10-06T10:05:00+06:30',
      uploaded_by: { user_id: FIXTURE_IDS.users[AUNG], display_name: 'Ko Aung' },
      uploaded_at: '2026-10-05T10:05:00+06:30',
      deleted_at: null,
    });
    expect(await count()).toBe(before + 1);
    const row = await stored(body.id);
    expect([row.image_width, row.image_height, row.kind]).toStrictEqual([600, 600, 2]);
    expect(row.storage_key).toBe(`att/2026/10/${body.id}/original.png`);
    // The original and w400 exist; w800 and w1600 do not (never enlarged).
    expect(await storage.head(row.storage_key)).toStrictEqual({
      size_bytes: body.size_bytes,
      content_type: 'image/png',
    });
    expect((await storage.head(`att/2026/10/${body.id}/w400.webp`))?.content_type).toBe(
      'image/webp',
    );
    expect(await storage.head(`att/2026/10/${body.id}/w800.webp`)).toBeNull();
    expect(await storage.head(`att/2026/10/${body.id}/w1600.webp`)).toBeNull();
  });

  it('display_name follows the language of the caller: Ko Min, with the system default, gets his Myanmar name', async () => {
    const res = await upload(png600, { name: 'logo-a.png', who: MIN });
    expect(res.body.uploaded_by.display_name).toBe('ကိုမင်း');
  });

  it('no storage_key, no URL and no key in the body, and nothing of the key in the request log', async () => {
    const res = await upload(png600, { name: 'logo-a.png', type: 'image/png' });
    expect(Object.keys(res.body)).not.toContain('storage_key');
    expect(JSON.stringify(res.body)).not.toMatch(/att\/20|https?:|X-Amz/);
    expect(JSON.stringify(s.logs)).not.toMatch(/storage_key|att\/2026|X-Amz-Signature/);
  });

  it('A document: nrc-front.pdf 153,600 bytes → kind 1, application/pdf, image null, stored as received', async () => {
    const res = await upload(PDF, { name: 'nrc-front.pdf', purpose: 'document', who: MIN });
    expect(res.body).toMatchObject({
      kind: 1,
      mime_type: 'application/pdf',
      size_bytes: 153_600,
      image: null,
    });
    const row = await stored(res.body.id);
    expect([row.image_width, row.image_height]).toStrictEqual([null, null]);
    expect((await storage.head(row.storage_key))?.size_bytes).toBe(153_600);
  });

  it('An import file: customers.csv 32 bytes → kind 3, text/csv, image null', async () => {
    const res = await upload(CSV, { name: 'customers.csv', purpose: 'import', who: ZIN });
    expect(CSV.length).toBe(32);
    expect(res.body).toMatchObject({ kind: 3, mime_type: 'text/csv', size_bytes: 32, image: null });
  });

  it('A large photo: 4000 × 3000 is stored as 2560 × 1920 with the four variants', async () => {
    const photo = await gradientImage('jpeg', 4000, 3000, { gps: true });
    const res = await upload(photo, { name: 'photo-aung.jpg', type: 'image/jpeg' });
    expect(res.body.image).toStrictEqual({
      width: 2560,
      height: 1920,
      variants: ['original', 'w400', 'w800', 'w1600'],
    });
    const row = await stored(res.body.id);
    expect([row.image_width, row.image_height]).toStrictEqual([2560, 1920]);
  });

  it('HEIC from an iPhone is stored as JPEG (mime image/jpeg, extension jpg)', async () => {
    const heic = readFileSync(join(FIXTURES, 'gradient-3024x4032.heic'));
    const res = await upload(heic, { name: 'thura-bill.heic', type: 'image/heic', who: AUNG });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mime_type: 'image/jpeg' });
    expect((await stored(res.body.id)).storage_key).toMatch(/\/original\.jpg$/);
  });

  it('a second file part is dropped and the first is stored', async () => {
    const { cookie } = await s.signIn(AUNG);
    const res = await s.http
      .post('/api/v1/attachments')
      .set('Cookie', cookie)
      .field('purpose', 'image')
      .attach('file', png600, 'first.png')
      .attach('file', jpeg, 'second.jpg');
    expect(res.status).toBe(201);
    expect(res.body.file_name).toBe('first.png');
  });
});

describe('Scenario: guards and shape', () => {
  it('Signed out → 401 unauthenticated, no object and no row', async () => {
    const before = await count();
    const res = await s.http
      .post('/api/v1/attachments')
      .field('purpose', 'image')
      .attach('file', png600, 'logo-a.png');
    expect([res.status, res.body.code]).toStrictEqual([401, ErrorCode.UNAUTHENTICATED]);
    expect(await count()).toBe(before);
  });

  it('Missing CSRF header → 403 csrf and nothing stored', async () => {
    const before = await count();
    const { cookie } = await s.signIn(AUNG);
    const res = await s.raw
      .post('/api/v1/attachments')
      .set('Cookie', cookie)
      .field('purpose', 'image')
      .attach('file', png600, 'logo-a.png');
    expect([res.status, res.body.code]).toStrictEqual([403, 'csrf']);
    expect(await count()).toBe(before);
  });

  it('No file part → 400 validation, errors[0] = file invalid_type', async () => {
    const res = await upload(null);
    expect([res.status, res.body.code]).toStrictEqual([400, ErrorCode.VALIDATION]);
    expect(res.body.errors[0]).toMatchObject({ field: 'file', code: 'invalid_type' });
  });

  it('A purpose outside the three → 400 on purpose, and nothing stored', async () => {
    const before = await count();
    const res = await upload(png600, { name: 'logo-a.png', purpose: 'video' });
    expect([res.status, res.body.errors[0].field]).toStrictEqual([400, 'purpose']);
    expect(await count()).toBe(before);
  });

  it('File name length: 255 characters → 201, 256 → 400 on file with too_big and maximum 255', async () => {
    const name = (length: number) => `${'a'.repeat(length - 4)}.jpg`;
    expect((await upload(jpeg, { name: name(255) })).status).toBe(201);
    const res = await upload(jpeg, { name: name(256) });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toStrictEqual({
      field: 'file',
      code: 'too_big',
      params: { maximum: 255 },
    });
  });
});

describe('Scenario: the size limit counts bytes and comes before the type', () => {
  const refused = async (res: Response, before: number, maxMb: number) => {
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      422,
      ErrorCode.FILE_TOO_LARGE,
      { max_mb: maxMb },
    ]);
    expect(await count()).toBe(before);
  };

  it('Exactly at the limit: 10,485,760 bytes → 201; one byte over → 422 file_too_large { max_mb: 10 }, no row', async () => {
    const at = padTo(await gradientImage('jpeg', 64, 64), MB10);
    expect((await upload(at, { name: 'boundary-10mb.jpg' })).status).toBe(201);
    const before = await count();
    const over = padTo(await gradientImage('jpeg', 64, 64), MB10 + 1);
    await refused(await upload(over, { name: 'boundary-10mb-plus1.jpg' }), before, 10);
  });

  it('Size is checked before type: a GIF of 10,485,761 bytes is file_too_large', async () => {
    const gif = padTo(Buffer.from('GIF89a'), MB10 + 1);
    const before = await count();
    await refused(await upload(gif, { name: 'animation.gif' }), before, 10);
  });

  it('The setting is changed to 5: 5,242,880 → 201, 5,242,881 → 422 { max_mb: 5 }', async () => {
    await storeSetting(s, 'system.upload_max_mb', 5);
    try {
      const small = await gradientImage('jpeg', 64, 64);
      expect((await upload(padTo(small, 5_242_880))).status).toBe(201);
      const before = await count();
      await refused(await upload(padTo(small, 5_242_881)), before, 5);
    } finally {
      await storeSetting(s, 'system.upload_max_mb', 10);
    }
  });

  it('An empty file → 422 file_type_not_allowed with the four image formats', async () => {
    const res = await upload(Buffer.alloc(0), { name: 'empty.png' });
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      422,
      ErrorCode.FILE_TYPE_NOT_ALLOWED,
      { allowed: ['JPEG', 'PNG', 'WebP', 'HEIC'] },
    ]);
  });
});

describe('Scenario: the type is read from the first bytes', () => {
  const IMAGE = ['JPEG', 'PNG', 'WebP', 'HEIC'];
  const notAllowed = (res: Response, allowed: string[]) =>
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      422,
      ErrorCode.FILE_TYPE_NOT_ALLOWED,
      { allowed },
    ]);

  it('A real PNG named scan.txt with the type text/plain → 201, file_name as received, image/png, key ends in /original.png', async () => {
    const res = await upload(png600, { name: 'scan.txt', type: 'text/plain' });
    expect([res.status, res.body.file_name, res.body.mime_type]).toStrictEqual([
      201,
      'scan.txt',
      'image/png',
    ]);
    expect((await stored(res.body.id)).storage_key).toMatch(/\/original\.png$/);
  });

  it('A PDF renamed .jpg with the type image/jpeg → 422 with the image formats; nothing stored', async () => {
    const before = await count();
    notAllowed(await upload(PDF, { name: 'holiday.jpg', type: 'image/jpeg' }), IMAGE);
    expect(await count()).toBe(before);
  });

  it('A GIF and an SVG are refused; a GIF as a document names the five formats', async () => {
    const gif = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
    notAllowed(await upload(gif, { name: 'animation.gif' }), IMAGE);
    notAllowed(await upload(Buffer.from('<svg xmlns="x"/>'), { name: 'logo.svg' }), IMAGE);
    notAllowed(await upload(gif, { name: 'animation.gif', purpose: 'document', who: MIN }), [
      ...IMAGE,
      'PDF',
    ]);
  });

  it('A PDF is a document, not an image; a photo is not an import file; a CSV is not a document', async () => {
    notAllowed(await upload(PDF, { name: 'nrc-front.pdf', who: MIN }), IMAGE);
    notAllowed(await upload(png600, { name: 'logo-a.png', purpose: 'import', who: ZIN }), [
      'CSV',
      'XLSX',
    ]);
    notAllowed(await upload(CSV, { name: 'customers.csv', purpose: 'document', who: MIN }), [
      ...IMAGE,
      'PDF',
    ]);
  });

  it('A JPEG that cannot be decoded is refused as a type, and leaves nothing', async () => {
    const before = await count();
    notAllowed(await upload(jpeg.subarray(0, 200), { name: 'damaged.jpg' }), IMAGE);
    expect(await count()).toBe(before);
    expect(await s.prisma.attachments.count({ where: { file_name: 'damaged.jpg' } })).toBe(0);
  });
});

describe('Scenario: a file name in Zawgyi is refused; the server never converts it', () => {
  it('A Zawgyi file name → 400 zawgyi_text on file, nothing stored; the Unicode form → 201 as received', async () => {
    const before = await count();
    const zawgyi = await upload(png600, { name: 'ေဘာင္ခ်ာ ၁.png' });
    expect([zawgyi.status, zawgyi.body.code]).toStrictEqual([400, ErrorCode.ZAWGYI_TEXT]);
    expect(zawgyi.body.errors[0]).toStrictEqual({ field: 'file', code: ErrorCode.ZAWGYI_TEXT });
    expect(await count()).toBe(before);
    const unicode = await upload(png600, { name: 'ဘောင်ချာ ၁.png' });
    expect([unicode.status, unicode.body.file_name]).toStrictEqual([201, 'ဘောင်ချာ ၁.png']);
  });
});

describe('Scenario: the original is stored under a fixed key, then the row is written', () => {
  it('The key follows Myanmar time: 31/Oct 23:59 → att/2026/10/…, 01/Nov 00:00 (17:30 UTC) → att/2026/11/…', async () => {
    s.clock?.set(new Date('2026-10-31T23:59:00+06:30'));
    const first = await upload(png600, { name: 'logo-a.png' });
    s.clock?.set(new Date('2026-11-01T00:00:00+06:30'));
    const second = await upload(png600, { name: 'logo-a.png' });
    s.clock?.set(new Date('2026-10-05T10:05:00+06:30'));
    expect((await stored(first.body.id)).storage_key).toBe(
      `att/2026/10/${first.body.id}/original.png`,
    );
    expect((await stored(second.body.id)).storage_key).toBe(
      `att/2026/11/${second.body.id}/original.png`,
    );
    expect(await storage.head(`att/2026/11/${second.body.id}/original.png`)).not.toBeNull();
  });

  it('A file name cannot steer the key: ..\\..\\evil.png is stored as received, the key is att/2026/10/<id>/original.png', async () => {
    // The multipart body is written by hand: a client library on Windows cuts a path off the name.
    const { cookie } = await s.signIn(AUNG);
    const boundary = 'point-boundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nimage\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="..\\..\\evil.png"\r\n` +
          'Content-Type: image/png\r\n\r\n',
      ),
      png600,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await s.http
      .post('/api/v1/attachments')
      .set('Cookie', cookie)
      .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
      .send(body);
    expect(res.status).toBe(201);
    const row = await stored(res.body.id);
    expect(row.file_name).toBe('..\\..\\evil.png');
    expect(row.storage_key).toBe(`att/2026/10/${res.body.id}/original.png`);
  });
});

/** A storage whose writes can be made to fail — the bucket times out, or stops after some writes. */
class FlakyStorage extends InMemoryStorageService {
  puts = 0;
  failFrom: number | null = null;
  override async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.puts += 1;
    if (this.failFrom !== null && this.puts >= this.failFrom) throw new Error('timeout');
    await super.put(key, body, contentType);
  }
}

describe('Scenario: the bucket or the row fails', () => {
  let flaky: SeededApp;
  const memory = new FlakyStorage();
  const post = async (file: Buffer, name: string) => {
    const { cookie } = await flaky.signIn(AUNG);
    return flaky.http
      .post('/api/v1/attachments')
      .set('Cookie', cookie)
      .field('purpose', 'image')
      .attach('file', file, name);
  };
  const objects = (): number => memory.keys().length;

  beforeAll(async () => {
    flaky = await seededApp(new Date('2026-10-05T10:05:00+06:30'), {
      overrides: [{ provide: StorageService, useValue: memory }],
    });
  }, 90_000);
  afterAll(() => flaky.close());

  it('The bucket is down: the first write times out → 500 internal_error and no row', async () => {
    const before = await flaky.prisma.attachments.count();
    memory.failFrom = memory.puts + 1;
    const res = await post(png600, 'logo-a.png');
    memory.failFrom = null;
    expect([res.status, res.body.code]).toStrictEqual([500, ErrorCode.INTERNAL_ERROR]);
    expect(await flaky.prisma.attachments.count()).toBe(before);
    expect(objects()).toBe(0);
  });

  it('A write after the first fails: the original already written is deleted, no row', async () => {
    const before = await flaky.prisma.attachments.count();
    memory.failFrom = memory.puts + 2; // the original, then w400.webp fails
    const res = await post(png600, 'logo-a.png');
    memory.failFrom = null;
    expect(res.status).toBe(500);
    expect(await flaky.prisma.attachments.count()).toBe(before);
    expect(objects()).toBe(0);
  });

  it('The row cannot be written: both objects (original and w400.webp) are deleted → 500', async () => {
    const insert = vi
      .spyOn(flaky.app.get(AttachmentsRepository), 'insertStaging')
      .mockRejectedValueOnce(new Error('the insert failed'));
    const before = await flaky.prisma.attachments.count();
    const res = await post(png600, 'logo-a.png');
    expect(insert).toHaveBeenCalledTimes(1);
    expect([res.status, res.body.code]).toStrictEqual([500, ErrorCode.INTERNAL_ERROR]);
    expect(await flaky.prisma.attachments.count()).toBe(before);
    expect(objects()).toBe(0);
    // and the next upload works, with its two objects
    expect((await post(png600, 'logo-a.png')).status).toBe(201);
    expect(objects()).toBe(2);
  });
});
