import { branchSchema } from '@point/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { B4 } from './helpers/branches.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-branch-management tasks 3.1 / 3.4 — organization spec "A new branch starts ACTIVE and public with
// the default attendance radius", "A branch code is 1–10 capital letters or digits and unique in the
// company", the create side of "Branch members are checked against their limits" and of "Zawgyi text
// in a branch is refused" (P1.BR.02 · Part 1 §13 #4 · D-ATT-01 · API-SHAPE-05 · design D3 / D4 / D5).
// A scenario that creates B4 runs on a database of its own, so each one starts with three branches.
const NOW = new Date('2026-10-05T09:30:00+06:30');
// "No. 3, Example Road" in Myanmar typed with a Zawgyi keyboard (detector probability ≥ 0.95).
const ZAWGYI_ADDRESS =
  '\u1021\u1019\u103d\u1010\u1039 \u1043\u104a \u1005\u1019\u1039\u1038\u101e\u1015\u1039\u101c\u1019\u1039\u1038';

type Caller = { readonly cookie: string };

function seeded() {
  const app: { t?: SeededApp; kyawZin?: Caller } = {};
  beforeAll(async () => {
    app.t = await startSeededApp({ now: NOW });
    app.kyawZin = await app.t.signIn('E001');
  });
  afterAll(async () => {
    await app.t?.close();
  });
  const t = () => {
    if (app.t === undefined) throw new Error('no app');
    return app.t;
  };
  return {
    t,
    create: (body: object) =>
      t()
        .http.post('/api/v1/branches')
        .set('Cookie', app.kyawZin?.cookie ?? '')
        .send(body),
    branches: () => t().prisma.branches.count(),
  };
}

describe('add-branch-management · organization · A new branch starts ACTIVE and public with the default attendance radius', () => {
  describe('Scenario: Only the code and the names', () => {
    const s = seeded();
    it('status 1, public, radius 100 from the setting, no links, every other member null', async () => {
      const res = await s.create(B4);
      expect(res.status).toBe(201);
      const branch = branchSchema.parse(res.body);
      expect(branch).toMatchObject({
        code: 'B4',
        name_mm: 'ပွိုင့် ၄.၀',
        name_en: 'Point 4.0',
        status: 1,
        is_public: true,
        location_radius_meters: 100,
        social_links: {},
        phone: null,
        email: null,
        latitude: null,
        longitude: null,
        map_url: null,
        active_employees: 0,
        created_at: '2026-10-05T09:30:00+06:30',
        updated_at: '2026-10-05T09:30:00.000+06:30',
      });
      const row = await s.t().prisma.branches.findUniqueOrThrow({ where: { id: branch.id } });
      expect(row).toMatchObject({ status: 1, archived_at: null, social_links: null });
      const company = await s.t().prisma.companies.findFirstOrThrow({ select: { id: true } });
      expect(row.company_id).toBe(company.id);
    });
  });

  describe('Scenario: Values that are sent are kept', () => {
    const s = seeded();
    it('is_public false, the coordinates and the radius as sent', async () => {
      const res = await s.create({
        ...B4,
        is_public: false,
        latitude: 16.8409,
        longitude: 96.1735,
        location_radius_meters: 50,
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        is_public: false,
        latitude: 16.8409,
        longitude: 96.1735,
        location_radius_meters: 50,
      });
    });
  });

  describe('Scenario: A radius sent as null', () => {
    const s = seeded();
    it('is stored as NULL (Part 5 then uses the setting at clock-in)', async () => {
      const res = await s.create({ ...B4, location_radius_meters: null });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ location_radius_meters: null });
    });
  });
});

describe('add-branch-management · organization · A branch code is 1–10 capital letters or digits and unique in the company', () => {
  const s = seeded();
  const names = { name_mm: 'ပွိုင့် ၄.၀', name_en: 'Point 4.0' };

  it('Scenario: Ten characters are accepted', async () => {
    const res = await s.create({ ...names, code: 'PX12345678' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ code: 'PX12345678' });
  });

  it('Scenario: Eleven characters are refused', async () => {
    const res = await s.create({ ...names, code: 'PX123456789' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation',
      errors: [{ field: 'code', code: 'too_big', params: { maximum: 10 } }],
    });
  });

  it('Scenario: Lower case, signs and an empty code are refused', async () => {
    const before = await s.branches();
    for (const code of ['b4', 'B-4']) {
      const res = await s.create({ ...names, code });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ errors: [{ field: 'code', code: 'invalid_format' }] });
    }
    const empty = await s.create({ ...names, code: '' });
    expect(empty.status).toBe(400);
    expect(empty.body).toMatchObject({
      errors: [{ field: 'code', code: 'too_small', params: { minimum: 1 } }],
    });
    expect(await s.branches()).toBe(before);
  });

  it('Scenario: A code that exists', async () => {
    const before = await s.branches();
    const res = await s.create({ ...names, code: 'B3' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'already_exists' });
    expect(await s.branches()).toBe(before);
    const list = await s
      .t()
      .http.get('/api/v1/branches')
      .set('Cookie', (await s.t().signIn('E001')).cookie);
    expect((list.body as { items: { code: string }[] }).items.map((b) => b.code)).toStrictEqual([
      'B1',
      'B2',
      'B3',
      'PX12345678',
    ]);
  });

  it('Scenario: Several members wrong at once', async () => {
    const res = await s.create({ code: 'b4', name_en: 'Point 4.0' });
    expect(res.status).toBe(400);
    expect((res.body as { errors: unknown[] }).errors).toStrictEqual([
      { field: 'code', code: 'invalid_format' },
      { field: 'name_mm', code: 'invalid_type', params: { expected: 'string' } },
    ]);
  });

  it('Scenario: Myanmar name at and over the limit', async () => {
    const ok = await s.create({ code: 'NAME255', name_mm: 'မ'.repeat(255) });
    expect(ok.status).toBe(201);
    const long = await s.create({ code: 'NAME256', name_mm: 'မ'.repeat(256) });
    expect(long.status).toBe(400);
    expect((long.body as { errors: unknown[] }).errors[0]).toStrictEqual({
      field: 'name_mm',
      code: 'too_big',
      params: { maximum: 255 },
    });
    const blank = await s.create({ code: 'BLANK', name_mm: '   ' });
    expect(blank.status).toBe(400);
    expect(blank.body).toMatchObject({
      errors: [{ field: 'name_mm', code: 'too_small', params: { minimum: 1 } }],
    });
  });

  it('an optional text empty after trimming is stored as NULL; the names are trimmed', async () => {
    const res = await s.create({
      code: 'TRIM',
      name_mm: '  ပွိုင့် ၄.၀ ',
      name_en: '   ',
      phone: '',
      address_en: '  ',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name_mm: 'ပွိုင့် ၄.၀',
      name_en: null,
      phone: null,
      address_en: null,
    });
  });
});

describe('add-branch-management · organization · Zawgyi text in a branch is refused — on create', () => {
  const s = seeded();

  it('a Zawgyi name_en on create → 400 zawgyi_text and no row', async () => {
    const before = await s.branches();
    const res = await s.create({ ...B4, name_en: ZAWGYI_ADDRESS });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'zawgyi_text',
      errors: [{ field: 'name_en', code: 'zawgyi_text' }],
    });
    expect(await s.branches()).toBe(before);
  });

  it('Zawgyi text with a code that exists → 400 zawgyi_text (checked before the insert, as on update) and no row', async () => {
    const before = await s.branches();
    const res = await s.create({ ...B4, code: 'B3', address_mm: ZAWGYI_ADDRESS });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'zawgyi_text',
      errors: [{ field: 'address_mm', code: 'zawgyi_text' }],
    });
    expect(await s.branches()).toBe(before);
  });

  it('every member found is listed, an other-link label included', async () => {
    const res = await s.create({
      ...B4,
      name_mm: ZAWGYI_ADDRESS,
      address_mm: ZAWGYI_ADDRESS,
      social_links: { other: [{ label: ZAWGYI_ADDRESS, url: 'https://point.example' }] },
    });
    expect(res.status).toBe(400);
    expect((res.body as { errors: unknown[] }).errors).toStrictEqual([
      { field: 'name_mm', code: 'zawgyi_text' },
      { field: 'address_mm', code: 'zawgyi_text' },
      { field: 'social_links.other[0].label', code: 'zawgyi_text' },
    ]);
  });
});
