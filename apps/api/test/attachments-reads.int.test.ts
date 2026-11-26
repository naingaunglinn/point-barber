import { randomUUID } from 'node:crypto';

import { ErrorCode, attachmentSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import type { Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppConfig } from '../src/common/config/config.js';
import { StorageService } from '../src/modules/platform/index.js';
import { gradientImage, padTo } from './helpers/test-images.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-attachments-upload tasks 3.7 / 3.9 — GET /v1/attachments, /{id} and /{id}/url (P8.ATT.02 – 04 ·
// P8-RULE-03 policy table · API-PERM-03 · CG-SEC-02 · CG-SEC-10): who may read what, the same 404 for
// another user's row, a removed row and an unknown id, `image` from the row alone with no bucket call, and
// the 5-minute link that is signed locally and never stored or logged. Real MinIO for the bucket.
const AUNG: FixturePerson = 'E004';
const MIN: FixturePerson = 'E005';
const ZIN: FixturePerson = 'E001';
const UNKNOWN = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';
const AUNG_USER = FIXTURE_IDS.users[AUNG];

let s: SeededApp;
let storage: StorageService;
let companyId: string;
let a: Record<string, unknown>; // logo-a.png 600 × 600 — Ko Aung's staging row
let p: Record<string, unknown>; // photo-aung.jpg 4000 × 3000 → stored 2560 × 1920
let n: Record<string, unknown>; // nrc-front.pdf
let min: Record<string, unknown>; // `nrc front.pdf` — Ko Min's staging row

const idOf = (row: Record<string, unknown>): string => String(row.id);

async function send(who: FixturePerson, file: Buffer, name: string, purpose: string) {
  const { cookie } = await s.signIn(who);
  const res = await s.http
    .post('/api/v1/attachments')
    .set('Cookie', cookie)
    .field('purpose', purpose)
    .attach('file', file, name);
  expect(res.status).toBe(201);
  return res.body as Record<string, unknown>;
}

async function get(who: FixturePerson | null, path: string): Promise<Response> {
  const request = s.http.get(`/api/v1${path}`);
  return who === null ? request : request.set('Cookie', (await s.signIn(who)).cookie);
}

/** A row the upload does not make: linked files of the owning changes, inserted as their code will. */
const insertRow = (
  entity_type: string,
  entity_id: string,
  kind: number,
  mime_type: string,
  size: [number, number] | null = null,
) => {
  const id = randomUUID();
  return s.prisma.attachments.create({
    data: {
      id,
      company_id: companyId,
      entity_type,
      entity_id,
      kind,
      storage_key: `att/2026/10/${id}/original.${mime_type === 'application/pdf' ? 'pdf' : 'jpg'}`,
      file_name: `${entity_type}-${kind}`,
      mime_type,
      size_bytes: 1_000n,
      uploaded_by_user_id: FIXTURE_IDS.users[ZIN],
      uploaded_at: new Date('2026-10-05T09:00:00+06:30'),
      image_width: size?.[0] ?? null,
      image_height: size?.[1] ?? null,
    },
  });
};

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:05:00+06:30'));
  storage = s.app.get(StorageService);
  companyId = (await s.prisma.companies.findFirstOrThrow({ select: { id: true } })).id;
  a = await send(AUNG, await gradientImage('png', 600, 600), 'logo-a.png', 'image');
  p = await send(
    AUNG,
    await gradientImage('jpeg', 4000, 3000, { gps: true }),
    'photo-aung.jpg',
    'image',
  );
  n = await send(AUNG, padTo(Buffer.from('%PDF-1.7\n'), 153_600), 'nrc-front.pdf', 'document');
  min = await send(MIN, padTo(Buffer.from('%PDF-1.7\n'), 2_048), 'nrc front.pdf', 'document');
}, 90_000);
afterAll(() => s.close());

// No read may reach the bucket for a row (the size is on the row); the link is signed locally.
const bucketCalls = () =>
  (['put', 'head', 'getStream', 'delete'] as const).map((method) => vi.spyOn(storage, method));
beforeEach(() => vi.restoreAllMocks());

describe('Scenario: a staging file is readable only by the person who uploaded it', () => {
  it('The uploader reads her own row: 200, the same Attachment as the upload response, no bucket call', async () => {
    const calls = bucketCalls();
    const res = await get(AUNG, `/attachments/${idOf(a)}`);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual(a);
    expect(attachmentSchema.parse(res.body).staging).toBe(true);
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it('Another barber and the admin get 404 with the same members as an unknown id', async () => {
    const unknown = await get(AUNG, `/attachments/${UNKNOWN}`);
    expect(unknown.status).toBe(404);
    const { request_id: _unknownRequest, ...unknownBody } = unknown.body;
    for (const who of [MIN, ZIN]) {
      const res = await get(who, `/attachments/${idOf(a)}`);
      expect(res.status).toBe(404);
      const { request_id: _request, ...body } = res.body;
      expect(body).toStrictEqual(unknownBody);
      expect(JSON.stringify(res.body)).not.toContain(idOf(a));
    }
  });

  it('a removed row and an id that is no uuid answer the same 404', async () => {
    const removed = await insertRow('uploads', AUNG_USER, 1, 'application/pdf');
    await s.prisma.attachments.update({
      where: { id: removed.id },
      data: { deleted_at: new Date(), deleted_by_user_id: AUNG_USER },
    });
    for (const id of [removed.id, 'not-a-uuid']) {
      const res = await get(AUNG, `/attachments/${id}`);
      expect([res.status, res.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
    }
  });

  it('Signed out → 401 unauthenticated', async () => {
    const res = await get(null, `/attachments/${idOf(a)}`);
    expect([res.status, res.body.code]).toStrictEqual([401, ErrorCode.UNAUTHENTICATED]);
  });

  it('image of logo-a.png (600 × 600) and photo-aung.jpg (stored 2560 × 1920) is the same on POST, GET one and GET list; null for the PDF', async () => {
    const calls = bucketCalls();
    const list = await get(AUNG, `/attachments?entity_type=uploads&entity_id=${AUNG_USER}`);
    expect(list.status).toBe(200);
    const items = list.body.items as Record<string, unknown>[];
    const byId = (id: string) => items.find((item) => item.id === id);
    expect(a.image).toStrictEqual({ width: 600, height: 600, variants: ['original', 'w400'] });
    expect(p.image).toStrictEqual({
      width: 2560,
      height: 1920,
      variants: ['original', 'w400', 'w800', 'w1600'],
    });
    for (const posted of [a, p, n]) {
      const one = await get(AUNG, `/attachments/${idOf(posted)}`);
      expect(one.body.image).toStrictEqual(posted.image);
      expect(byId(idOf(posted))?.image).toStrictEqual(posted.image);
    }
    expect(n.image).toBeNull();
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it('Listing own staging files: newest first, a removed row is excluded', async () => {
    s.clock?.set(new Date('2026-10-05T10:20:00+06:30'));
    const a2 = await send(AUNG, await gradientImage('png', 600, 600), 'logo-a2.png', 'image');
    s.clock?.set(new Date('2026-10-05T10:05:00+06:30'));
    const path = `/attachments?entity_type=uploads&entity_id=${AUNG_USER}`;
    const ids = ((await get(AUNG, path)).body.items as { id: string }[]).map((item) => item.id);
    expect(ids[0]).toBe(idOf(a2));
    await s.prisma.attachments.update({
      where: { id: idOf(a2) },
      data: { deleted_at: new Date(), deleted_by_user_id: AUNG_USER },
    });
    const after = ((await get(AUNG, path)).body.items as { id: string }[]).map((item) => item.id);
    expect(after).toStrictEqual(ids.slice(1));
  });

  it("Listing someone else's staging files: Ko Min asking for Ko Aung's id → 404; the admin too", async () => {
    for (const who of [MIN, ZIN]) {
      const res = await get(who, `/attachments?entity_type=uploads&entity_id=${AUNG_USER}`);
      expect([res.status, res.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
    }
  });

  it('An unknown entity type and a receipt type are 400 validation on entity_type', async () => {
    for (const type of ['widgets', 'sales']) {
      const res = await get(AUNG, `/attachments?entity_type=${type}&entity_id=${UNKNOWN}`);
      expect([res.status, res.body.code]).toStrictEqual([400, ErrorCode.VALIDATION]);
      expect(res.body.errors[0].field).toBe('entity_type');
    }
  });
});

describe('Scenario: logo, photo and other kinds follow the policy of their owner', () => {
  it('A barber lists the company logo: 200, the row with staging false, expires_at null and no URL', async () => {
    const logo = await insertRow('companies', companyId, 2, 'image/jpeg', [800, 400]);
    const res = await get(AUNG, `/attachments?entity_type=companies&entity_id=${companyId}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: logo.id,
      entity_type: 'companies',
      kind: 2,
      staging: false,
      expires_at: null,
      image: { width: 800, height: 400, variants: ['original', 'w400', 'w800'] },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/https?:|att\/20|storage_key/);
  });

  it('Employee rows are filtered per kind: a photo is listed, a kind-1 row has no policy and is left out', async () => {
    const employee = FIXTURE_IDS.employees[AUNG];
    const photo = await insertRow('employees', employee, 2, 'image/jpeg', [600, 600]);
    const document = await insertRow('employees', employee, 1, 'application/pdf');
    const res = await get(MIN, `/attachments?entity_type=employees&entity_id=${employee}`);
    expect(res.status).toBe(200);
    expect((res.body.items as { id: string }[]).map((item) => item.id)).toStrictEqual([photo.id]);
    // by id and by URL, the row without a policy is not found — for the admin as for anyone
    for (const path of [`/attachments/${document.id}`, `/attachments/${document.id}/url`]) {
      const denied = await get(ZIN, path);
      expect([denied.status, denied.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
    }
  });

  it('An entity that does not exist: the company list with an unknown id → 404', async () => {
    const res = await get(AUNG, `/attachments?entity_type=companies&entity_id=${UNKNOWN}`);
    expect([res.status, res.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
  });

  it('a linked company logo is readable by id by any signed-in staff member', async () => {
    const logo = await insertRow('companies', companyId, 2, 'image/jpeg', [800, 400]);
    expect((await get(MIN, `/attachments/${logo.id}`)).status).toBe(200);
  });
});

describe('Scenario: a signed download link lives 5 minutes and is made for each request', () => {
  const urlOf = (res: Response): URL => new URL(res.body.url as string);

  it('Five minutes: expires_at is 10:10:00 and the link carries X-Amz-Expires=300 on the bucket host', async () => {
    const res = await get(AUNG, `/attachments/${idOf(a)}/url`);
    expect(res.status).toBe(200);
    expect(res.body.expires_at).toBe('2026-10-05T10:10:00+06:30');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body).sort()).toStrictEqual(['expires_at', 'url']);
    expect(urlOf(res).searchParams.get('X-Amz-Expires')).toBe('300');
    const { env } = s.app.get(AppConfig);
    expect(urlOf(res).origin).toBe(new URL(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT).origin);
  });

  it('A variant: w400 of photo-aung.jpg ends in /att/2026/10/<P>/w400.webp; w1600 of the 600-px logo falls back to the original', async () => {
    const variant = await get(AUNG, `/attachments/${idOf(p)}/url?variant=w400`);
    expect(urlOf(variant).pathname).toMatch(new RegExp(`/att/2026/10/${idOf(p)}/w400\\.webp$`));
    const fallback = await get(AUNG, `/attachments/${idOf(a)}/url?variant=w1600`);
    expect(urlOf(fallback).pathname).toMatch(new RegExp(`/att/2026/10/${idOf(a)}/original\\.png$`));
    const pdf = await get(AUNG, `/attachments/${idOf(n)}/url?variant=w400`);
    expect(urlOf(pdf).pathname).toMatch(/\/original\.pdf$/);
  });

  it('A variant outside the list: w300 → 400 validation on variant', async () => {
    const res = await get(AUNG, `/attachments/${idOf(a)}/url?variant=w300`);
    expect([res.status, res.body.code, res.body.errors[0].field]).toStrictEqual([
      400,
      ErrorCode.VALIDATION,
      'variant',
    ]);
  });

  it("Download: Ko Min's `nrc front.pdf` gets the content disposition with the name percent-encoded", async () => {
    const res = await get(MIN, `/attachments/${idOf(min)}/url?download=true`);
    expect(urlOf(res).searchParams.get('response-content-disposition')).toBe(
      "attachment; filename*=UTF-8''nrc%20front.pdf",
    );
    const plain = await get(MIN, `/attachments/${idOf(min)}/url`);
    expect(urlOf(plain).searchParams.has('response-content-disposition')).toBe(false);
  });

  it("Not the uploader, or removed: Ko Min on Ko Aung's row and Ko Aung on a removed row → 404, no link", async () => {
    const other = await get(MIN, `/attachments/${idOf(a)}/url`);
    expect([other.status, other.body.code, other.body.url]).toStrictEqual([
      404,
      ErrorCode.NOT_FOUND,
      undefined,
    ]);
    const removed = await insertRow('uploads', AUNG_USER, 1, 'application/pdf');
    await s.prisma.attachments.update({
      where: { id: removed.id },
      data: { deleted_at: new Date(), deleted_by_user_id: AUNG_USER },
    });
    expect((await get(AUNG, `/attachments/${removed.id}/url`)).status).toBe(404);
  });

  it('The link is signed locally: no bucket call is made to answer', async () => {
    const calls = bucketCalls();
    expect((await get(AUNG, `/attachments/${idOf(a)}/url`)).status).toBe(200);
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it('No stored link: no column of attachments holds a URL, and the link is in no log line', async () => {
    const columns = await s.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'attachments'`;
    expect(
      columns.map((column) => column.column_name).filter((name) => /url|link|sign/.test(name)),
    ).toStrictEqual([]);
    const res = await get(AUNG, `/attachments/${idOf(a)}/url?download=true`);
    const signature = urlOf(res).searchParams.get('X-Amz-Signature') ?? '';
    expect(signature).not.toBe('');
    const logs = JSON.stringify(s.logs);
    expect(logs).not.toContain('X-Amz-Signature');
    expect(logs).not.toContain(signature);
    expect(logs).not.toContain(String(res.body.url));
  });
});
