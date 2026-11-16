import { branchSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-branch-management tasks 3.3 / 3.4 — organization spec "An update changes only the members it
// sends and never the code", "A stale update is refused", the update side of "Branch members are
// checked against their limits" and "Zawgyi text in a branch is refused" (P1.BR.04 · API-SHAPE-04 ·
// API-IDEM-04 · owner BR1 / BR3 · design D3 / D4 / D6). U Kyaw Zin on 05/Oct/2026 from 10:00 AM MMT.
const B = FIXTURE_IDS.branches;
const ZAWGYI_ADDRESS =
  '\u1021\u1019\u103d\u1010\u1039 \u1043\u104a \u1005\u1019\u1039\u1038\u101e\u1015\u1039\u101c\u1019\u1039\u1038';
const UNICODE_ADDRESS = 'အမှတ် ၃၊ စမ်းသပ်လမ်း';
let t: SeededApp;
let kyawZin: { readonly cookie: string };

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T09:59:00+06:30') });
  kyawZin = await t.signIn('E001');
});
afterAll(async () => {
  await t.close();
});

const patch = (id: string, body: object) =>
  t.http.patch(`/api/v1/branches/${id}`).set('Cookie', kyawZin.cookie).send(body);
const read = async (id: string) =>
  branchSchema.parse(
    (await t.http.get(`/api/v1/branches/${id}`).set('Cookie', kyawZin.cookie)).body,
  );
const at = (instant: string) => t.clock?.set(new Date(instant));
const errorsOf = (res: { body: unknown }) => (res.body as { errors: unknown[] }).errors;

describe('add-branch-management · organization · An update changes only the members it sends and never the code', () => {
  it('Scenario: One member changes', async () => {
    const before = await read(B.B3);
    at('2026-10-05T10:00:00+06:30');
    const res = await patch(B.B3, { phone: '09 7700 0003' });
    expect(res.status).toBe(200);
    const after = branchSchema.parse(res.body);
    expect(after).toStrictEqual({
      ...before,
      phone: '09 7700 0003',
      updated_at: '2026-10-05T10:00:00.000+06:30',
    });
    expect(after.name_en).toBe('Point 3.0');
    expect(after.is_public).toBe(true);
  });

  it('Scenario: A sent code is ignored', async () => {
    const res = await patch(B.B3, { code: 'B9', phone: '09 7700 0003' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: 'B3', phone: '09 7700 0003' });
    const list = await t.http.get('/api/v1/branches').set('Cookie', kyawZin.cookie);
    expect(
      (list.body as { items: { code: string }[] }).items.some((branch) => branch.code === 'B9'),
    ).toBe(false);
  });

  it('Scenario: A member is cleared', async () => {
    at('2026-10-05T10:01:00+06:30');
    const res = await patch(B.B3, { phone: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: null });
    // back to the phone of the next scenarios
    at('2026-10-05T10:02:00+06:30');
    expect((await patch(B.B3, { phone: '09 7700 0003' })).status).toBe(200);
  });

  it('Scenario: The Myanmar name cannot be cleared', async () => {
    const res = await patch(B.B3, { name_mm: null });
    expect(res.status).toBe(400);
    expect(errorsOf(res)[0]).toMatchObject({ field: 'name_mm', code: 'invalid_type' });
    expect((await read(B.B3)).name_mm).toBe('ပွိုင့် ၃.၀');
  });
});

describe('add-branch-management · organization · A stale update is refused', () => {
  // A database of its own: B3 as seeded, so the laptop's save changes its phone (T1 → T2).
  let s: SeededApp;
  let admin: { readonly cookie: string };
  beforeAll(async () => {
    s = await startSeededApp({ now: new Date('2026-10-05T09:59:00+06:30') });
    admin = await s.signIn('E001');
  });
  afterAll(async () => {
    await s.close();
  });
  const save = (id: string, body: object) =>
    s.http.patch(`/api/v1/branches/${id}`).set('Cookie', admin.cookie).send(body);
  const open = async (id: string) =>
    branchSchema.parse(
      (await s.http.get(`/api/v1/branches/${id}`).set('Cookie', admin.cookie)).body,
    );
  let t1 = '';
  let t2 = '';

  it('Scenario: Two open edits', async () => {
    // The laptop and the phone both read B3 (T1).
    t1 = (await open(B.B3)).updated_at;
    s.clock?.set(new Date('2026-10-05T10:00:00+06:30'));
    const laptop = await save(B.B3, { phone: '09 7700 0003', expected_updated_at: t1 });
    expect(laptop.status).toBe(200);
    t2 = branchSchema.parse(laptop.body).updated_at;
    expect(t2).toBe('2026-10-05T10:00:00.000+06:30');
    const phone = await save(B.B3, { address_en: 'No. 3, Example Road', expected_updated_at: t1 });
    expect(phone.status).toBe(409);
    expect(phone.body).toMatchObject({ code: 'conflict' });
    expect((phone.body as Record<string, unknown>).context).toBeUndefined();
    expect((await open(B.B3)).address_en).toBeNull();
  });

  it('Scenario: The current time is accepted', async () => {
    const res = await save(B.B3, { address_en: 'No. 3, Example Road', expected_updated_at: t2 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ address_en: 'No. 3, Example Road' });
  });

  it('Scenario: No expectation sent', async () => {
    s.clock?.set(new Date('2026-10-05T10:07:00+06:30'));
    const res = await save(B.B3, { address_en: 'No. 3, Example Road, Yangon' });
    expect(res.status).toBe(200);
  });

  it('a stored updated_at with microseconds is matched to the millisecond (design D6)', async () => {
    await s.prisma.$executeRaw`
      UPDATE branches SET updated_at = '2026-10-05T10:00:00.123456+06:30' WHERE id = ${B.B1}::uuid`;
    const read1 = await open(B.B1);
    expect(read1.updated_at).toBe('2026-10-05T10:00:00.123+06:30');
    const stale = await save(B.B1, {
      phone: '09 7700 0001',
      expected_updated_at: '2026-10-05T10:00:00.124+06:30',
    });
    expect(stale.status).toBe(409);
    const echoed = await save(B.B1, {
      phone: '09 7700 0001',
      expected_updated_at: read1.updated_at,
    });
    expect(echoed.status).toBe(200);
    // The same instant written in UTC is the same instant.
    const utc = new Date((await open(B.B1)).updated_at).toISOString();
    expect((await save(B.B1, { phone: null, expected_updated_at: utc })).status).toBe(200);
  });
});

describe('add-branch-management · organization · Branch members are checked against their limits — on update', () => {
  it('Scenario: Radius at and outside the limits', async () => {
    for (const radius of [10, 2000]) {
      expect((await patch(B.B3, { location_radius_meters: radius })).status).toBe(200);
    }
    const low = await patch(B.B3, { location_radius_meters: 9 });
    expect(low.status).toBe(400);
    expect(errorsOf(low)[0]).toStrictEqual({
      field: 'location_radius_meters',
      code: 'too_small',
      params: { minimum: 10 },
    });
    const high = await patch(B.B3, { location_radius_meters: 2001 });
    expect(high.status).toBe(400);
    expect(errorsOf(high)[0]).toStrictEqual({
      field: 'location_radius_meters',
      code: 'too_big',
      params: { maximum: 2000 },
    });
  });

  it('Scenario: Coordinates at and outside the limits', async () => {
    expect((await patch(B.B3, { latitude: 90 })).status).toBe(200);
    const lat = await patch(B.B3, { latitude: 91 });
    expect(lat.status).toBe(400);
    expect(errorsOf(lat)[0]).toMatchObject({ field: 'latitude', code: 'too_big' });
    const long = await patch(B.B3, { longitude: -181 });
    expect(long.status).toBe(400);
    expect(errorsOf(long)[0]).toMatchObject({ field: 'longitude', code: 'too_small' });
  });

  it('Scenario: Formats', async () => {
    const cases: [object, object][] = [
      [{ email: 'point4@' }, { field: 'email', code: 'email_invalid' }],
      [{ website_url: 'point4.example' }, { field: 'website_url', code: 'invalid_format' }],
      [{ map_url: 'javascript:alert(1)' }, { field: 'map_url', code: 'invalid_format' }],
      [{ phone: '9'.repeat(51) }, { field: 'phone', code: 'too_big', params: { maximum: 50 } }],
    ];
    for (const [body, error] of cases) {
      const res = await patch(B.B3, body);
      expect(res.status).toBe(400);
      expect(errorsOf(res)[0]).toStrictEqual(error);
    }
  });

  it('Scenario: Links at and over the limit', async () => {
    const head = 'https://facebook.com/';
    const link = (length: number) => head + 'a'.repeat(length - head.length);
    expect((await patch(B.B3, { social_links: { facebook: link(1000) } })).status).toBe(200);
    const long = await patch(B.B3, { social_links: { facebook: link(1001) } });
    expect(long.status).toBe(400);
    expect(errorsOf(long)[0]).toStrictEqual({
      field: 'social_links.facebook',
      code: 'too_big',
      params: { maximum: 1000 },
    });
    const other = Array.from({ length: 11 }, (_, i) => ({
      label: `Link ${i + 1}`,
      url: `https://point.example/${i + 1}`,
    }));
    const many = await patch(B.B3, { social_links: { other } });
    expect(many.status).toBe(400);
    expect(errorsOf(many)[0]).toMatchObject({ field: 'social_links.other', code: 'too_big' });
  });

  it('Scenario: Blank links are left out', async () => {
    const res = await patch(B.B3, {
      social_links: { facebook: 'https://facebook.com/point3', tiktok: '  ', viber: null },
    });
    expect(res.status).toBe(200);
    expect((res.body as { social_links: unknown }).social_links).toStrictEqual({
      facebook: 'https://facebook.com/point3',
    });
    expect((await read(B.B1)).social_links).toStrictEqual({});
  });
});

describe('add-branch-management · organization · Zawgyi text in a branch is refused', () => {
  it('Scenario: An address typed in Zawgyi', async () => {
    const res = await patch(B.B3, { address_mm: ZAWGYI_ADDRESS });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'zawgyi_text' });
    expect(errorsOf(res)[0]).toStrictEqual({ field: 'address_mm', code: 'zawgyi_text' });
    expect((await read(B.B3)).address_mm).toBeNull();
  });

  it('Scenario: Unicode is stored as sent', async () => {
    const res = await patch(B.B3, { address_mm: UNICODE_ADDRESS });
    expect(res.status).toBe(200);
    expect((res.body as { address_mm: string }).address_mm).toBe(UNICODE_ADDRESS);
    expect((await read(B.B3)).address_mm).toBe(UNICODE_ADDRESS);
  });
});
