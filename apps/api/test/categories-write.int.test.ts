import { ErrorCode, ScopeType, ServiceCategoryStatus, ServiceStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type CatalogueBuilder, catalogueBuilder } from './helpers/catalogue.js';
import { assignRole } from './helpers/roles.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-service-catalogue tasks 4.1 – 4.5 — the category endpoints P2.CAT.02 – 05 (services-pricing spec
// "Company master writes need a company-scope grant", "Create a service category", "Names are unique among
// non-archived rows", "New rows are placed last", "Edit a category with optimistic concurrency", "An
// inactive category hides its services from staff pickers", "A category is archived only when no service
// uses it", "A reorder lists every non-archived sibling once", "Every catalogue write leaves one audit
// row"). Monday 05/Oct/2026 at 10:00 AM MMT on the fixture catalogue: Services (sort_order 1) with Haircut,
// Shave and Hair wash.
const { serviceCategories, branches, services, employees } = FIXTURE_IDS;
const API = '/api/v1/service-categories';
const NOW = '2026-10-05T10:00:00+06:30';
// "No. 3, Example Road" in Myanmar typed with a Zawgyi keyboard (detector probability ≥ 0.95).
const ZAWGYI =
  '\u1021\u1019\u103d\u1010\u1039 \u1043\u104a \u1005\u1019\u1039\u1038\u101e\u1015\u1039\u101c\u1019\u1039\u1038';

let t: SeededApp;
let build: CatalogueBuilder;
const cookies: Record<string, string> = {};

beforeAll(async () => {
  t = await startSeededApp({ now: new Date(NOW) });
  build = await catalogueBuilder(t.prisma);
  // The seed Manager holds service.view and service.update only; the reach scenarios of Ma Hnin on create
  // and archive assume the codes ticked at her branch scope by an admin (the "holding the code only at
  // branch scope" case of the requirement), so she gets a test role with them at B3.
  await assignRole(t.prisma, {
    name: 'Catalogue master (test)',
    employeeId: employees.E002,
    codes: ['service.create', 'service.delete'],
    scope: ScopeType.BRANCHES,
    branchIds: [branches.B3],
  });
  for (const who of ['E001', 'E002', 'E004', 'E005'] as const)
    cookies[who] = (await t.signIn(who)).cookie;
});
afterAll(() => t.close());
// audit_events is append-only: a test sees only the rows written since it started.
let known = new Set<string>();
beforeEach(async () => {
  known = new Set(
    (await t.prisma.audit_events.findMany({ select: { id: true } })).map((row) => row.id),
  );
});
afterEach(async () => {
  t.clock?.set(new Date(NOW));
  await build.cleanup();
  // The categories the endpoints created (their services were removed above or never existed).
  await t.prisma.service_categories.deleteMany({
    where: { id: { not: serviceCategories.SERVICES } },
  });
  await t.prisma.service_categories.update({
    where: { id: serviceCategories.SERVICES },
    data: {
      name_mm: 'ဝန်ဆောင်မှု',
      name_en: 'Services',
      status: 1,
      sort_order: 1,
      archived_at: null,
      updated_at: new Date('2026-10-05T09:00:00+06:30'),
    },
  });
  await t.prisma.services.updateMany({
    where: { id: { in: Object.values(services) } },
    data: { status: ServiceStatus.ACTIVE, archived_at: null },
  });
});

const ADMIN = 'E001';
const HNIN = 'E002';
const AUNG = 'E004';
const MIN = 'E005';

const post = (who: string, path: string, body: object = {}) =>
  t.http
    .post(`/api/v1${path}`)
    .set('Cookie', cookies[who] ?? '')
    .send(body);
const patch = (who: string, id: string, body: object) =>
  t.http
    .patch(`${API}/${id}`)
    .set('Cookie', cookies[who] ?? '')
    .send(body);
const put = (who: string, body: object) =>
  t.http
    .put(`${API}/order`)
    .set('Cookie', cookies[who] ?? '')
    .send(body);
const list = async (who = ADMIN, query = '') =>
  (await t.http.get(`${API}${query}`).set('Cookie', cookies[who] ?? '')).body.items as {
    id: string;
    name_mm: string;
    name_en: string | null;
    sort_order: number;
    status: number;
    updated_at: string;
    archived_at: string | null;
  }[];
const current = async (id: string) => {
  const row = (await list(ADMIN, '?include_archived=true&status=0&status=1')).find(
    (item) => item.id === id,
  );
  if (row === undefined) throw new Error('no such category');
  return row;
};
const newAudits = async (action?: string) =>
  (
    await t.prisma.audit_events.findMany({
      where: { action: action ?? { startsWith: 'category.' } },
      orderBy: { id: 'asc' },
    })
  ).filter((row) => !known.has(row.id));
const audits = (action: string) => newAudits(action);
const KIDS = { name_mm: 'ကလေး', name_en: 'Kids' };
const createKids = async () => (await post(ADMIN, '/service-categories', KIDS)).body.id as string;

describe('The reach of P2.CAT.02 – 05 (task 4.1 · P2-RULE-01 · API-PERM-07 · CG-TEST-05)', () => {
  const routes = [
    ['create', 'service.create', (who: string) => post(who, '/service-categories', KIDS)],
    [
      'update',
      'service.update',
      (who: string) =>
        patch(who, serviceCategories.SERVICES, {
          name_en: 'Barber services',
          expected_updated_at: '2026-10-05T10:00:00.000+06:30',
        }),
    ],
    [
      'archive',
      'service.delete',
      (who: string) => post(who, `/service-categories/${serviceCategories.SERVICES}/archive`),
    ],
    ['reorder', 'service.update', (who: string) => put(who, { ids: [serviceCategories.SERVICES] })],
  ] as const;

  it.each(routes)(
    'Scenario: %s — Ma Hnin → 403 company_scope_required, Ko Aung → 403 forbidden with the code; nothing written',
    async (_name, code, call) => {
      const before = await list(ADMIN, '?include_archived=true');
      const manager = await call(HNIN);
      expect([manager.status, manager.body.code]).toStrictEqual([
        403,
        ErrorCode.COMPANY_SCOPE_REQUIRED,
      ]);
      const barber = await call(AUNG);
      expect([barber.status, barber.body.code, barber.body.context]).toStrictEqual([
        403,
        ErrorCode.FORBIDDEN,
        { required: code },
      ]);
      expect(await list(ADMIN, '?include_archived=true')).toStrictEqual(before);
      expect(await newAudits()).toHaveLength(0);
    },
  );
});

describe('Create a category (task 4.2 · P2.CAT.02 · SC2 ★ · design D7 / D8 / D9)', () => {
  it('Scenario: Kids — 201 with Location, status 1, English name, last position, one audit row', async () => {
    const res = await post(ADMIN, '/service-categories', KIDS);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name_mm: 'ကလေး',
      name_en: 'Kids',
      status: 1,
      sort_order: 2,
      archived_at: null,
      updated_at: '2026-10-05T10:00:00.000+06:30',
    });
    expect(res.headers.location).toBe(`${API}/${res.body.id}`);
    expect((await list()).map((row) => row.name_en)).toStrictEqual(['Services', 'Kids']);
    const [row, ...rest] = await audits('category.create');
    expect(rest).toStrictEqual([]);
    expect(row).toMatchObject({
      entity_type: 'service_categories',
      entity_id: res.body.id,
      branch_id: null,
      before_data: null,
      actor_user_id: FIXTURE_IDS.users.E001,
    });
    expect(row?.after_data).toMatchObject({ name_mm: 'ကလေး', name_en: 'Kids', sort_order: 2 });
  });

  it('Scenario: English left empty — name_en is stored as null', async () => {
    const res = await post(ADMIN, '/service-categories', { name_mm: 'ကလေး' });
    expect([res.status, res.body.name_en]).toStrictEqual([201, null]);
  });

  it('a sort_order sent is kept', async () => {
    const res = await post(ADMIN, '/service-categories', { ...KIDS, sort_order: 7 });
    expect(res.body.sort_order).toBe(7);
  });

  it('Scenario: Myanmar name at 150 characters is 201, at 151 is 400 too_big, empty is 400 too_small', async () => {
    expect((await post(ADMIN, '/service-categories', { name_mm: 'က'.repeat(150) })).status).toBe(
      201,
    );
    const long = await post(ADMIN, '/service-categories', { name_mm: 'က'.repeat(151) });
    expect([long.status, long.body.code, long.body.errors[0]]).toStrictEqual([
      400,
      ErrorCode.VALIDATION,
      { field: 'name_mm', code: 'too_big', params: { maximum: 150 } },
    ]);
    const empty = await post(ADMIN, '/service-categories', { name_mm: '', name_en: 'Kids' });
    expect([empty.status, empty.body.errors[0].field, empty.body.errors[0].code]).toStrictEqual([
      400,
      'name_mm',
      'too_small',
    ]);
  });

  it('Scenario: Duplicate category — 409 already_exists and nothing is created', async () => {
    const res = await post(ADMIN, '/service-categories', { name_mm: 'ဝန်ဆောင်မှု' });
    expect([res.status, res.body.code]).toStrictEqual([409, ErrorCode.ALREADY_EXISTS]);
    expect(await list()).toHaveLength(1);
    expect(await audits('category.create')).toHaveLength(0);
  });

  it('the name of an archived category is free again', async () => {
    const kids = await createKids();
    expect((await post(ADMIN, `/service-categories/${kids}/archive`)).status).toBe(200);
    const again = await post(ADMIN, '/service-categories', KIDS);
    expect([again.status, again.body.id === kids]).toStrictEqual([201, false]);
  });

  it('two creates with one name at the same time — one 201, one 409 (the unique index is the final word)', async () => {
    const results = await Promise.all([
      post(ADMIN, '/service-categories', KIDS),
      post(ADMIN, '/service-categories', KIDS),
    ]);
    expect(results.map((res) => res.status).sort()).toStrictEqual([201, 409]);
    expect(results.find((res) => res.status === 409)?.body.code).toBe(ErrorCode.ALREADY_EXISTS);
    expect(await list()).toHaveLength(2);
  });
});

describe('Zawgyi text in a category name is refused (API-SHAPE-05 · review of #87)', () => {
  it.each(['name_mm', 'name_en'])(
    'a Zawgyi %s on create → 400 zawgyi_text naming the member, nothing written',
    async (member) => {
      const res = await post(ADMIN, '/service-categories', { ...KIDS, [member]: ZAWGYI });
      expect([res.status, res.body.code, res.body.errors]).toStrictEqual([
        400,
        ErrorCode.ZAWGYI_TEXT,
        [{ field: member, code: ErrorCode.ZAWGYI_TEXT }],
      ]);
      expect(await list()).toHaveLength(1);
      expect(await audits('category.create')).toHaveLength(0);
    },
  );

  it('both names in Zawgyi → one errors[] item each', async () => {
    const res = await post(ADMIN, '/service-categories', { name_mm: ZAWGYI, name_en: ZAWGYI });
    expect(res.body.errors).toStrictEqual([
      { field: 'name_mm', code: ErrorCode.ZAWGYI_TEXT },
      { field: 'name_en', code: ErrorCode.ZAWGYI_TEXT },
    ]);
  });

  it('a Zawgyi rename on edit → 400 zawgyi_text, the row and its token stay', async () => {
    const before = await current(serviceCategories.SERVICES);
    const res = await patch(ADMIN, serviceCategories.SERVICES, {
      name_mm: ZAWGYI,
      expected_updated_at: before.updated_at,
    });
    expect([res.status, res.body.code, res.body.errors]).toStrictEqual([
      400,
      ErrorCode.ZAWGYI_TEXT,
      [{ field: 'name_mm', code: ErrorCode.ZAWGYI_TEXT }],
    ]);
    expect(await current(serviceCategories.SERVICES)).toStrictEqual(before);
    expect(await audits('category.update')).toHaveLength(0);
  });
});

describe('Edit a category (task 4.3 · P2.CAT.03 · API-IDEM-04 · Recorded reading 5)', () => {
  it('Scenario: Rename the English name — 200, the new name, updated_at of the write, one audit row', async () => {
    const before = await current(serviceCategories.SERVICES);
    t.clock?.set(new Date('2026-10-05T10:05:00+06:30'));
    const res = await patch(ADMIN, serviceCategories.SERVICES, {
      name_en: 'Barber services',
      expected_updated_at: before.updated_at,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name_en: 'Barber services',
      name_mm: before.name_mm,
      updated_at: '2026-10-05T10:05:00.000+06:30',
    });
    const [row, ...rest] = await audits('category.update');
    expect(rest).toStrictEqual([]);
    expect(row).toMatchObject({ branch_id: null, entity_id: serviceCategories.SERVICES });
    expect(row?.before_data).toStrictEqual({ name_en: 'Services' });
    expect(row?.after_data).toStrictEqual({ name_en: 'Barber services' });
  });

  it('Scenario: Someone saved first — 409 conflict and the values stay', async () => {
    const first = await current(serviceCategories.SERVICES);
    t.clock?.set(new Date('2026-10-05T10:05:00+06:30'));
    const saved = await patch(ADMIN, serviceCategories.SERVICES, {
      name_en: 'A',
      expected_updated_at: first.updated_at,
    });
    expect([saved.status, saved.body.updated_at]).toStrictEqual([
      200,
      '2026-10-05T10:05:00.000+06:30',
    ]);
    const stale = await patch(ADMIN, serviceCategories.SERVICES, {
      name_en: 'B',
      expected_updated_at: first.updated_at,
    });
    expect([stale.status, stale.body.code]).toStrictEqual([409, ErrorCode.CONFLICT]);
    expect((await current(serviceCategories.SERVICES)).name_en).toBe('A');
  });

  it('Scenario: No concurrency token — 400 validation on expected_updated_at', async () => {
    const res = await patch(ADMIN, serviceCategories.SERVICES, { name_en: 'Barber services' });
    expect([res.status, res.body.errors[0].field]).toStrictEqual([400, 'expected_updated_at']);
  });

  it('Scenario: Unchanged — 200, the same updated_at, no audit row', async () => {
    const before = await current(serviceCategories.SERVICES);
    t.clock?.set(new Date('2026-10-05T10:05:00+06:30'));
    const res = await patch(ADMIN, serviceCategories.SERVICES, {
      name_en: 'Services',
      status: 1,
      expected_updated_at: before.updated_at,
    });
    expect([res.status, res.body.updated_at]).toStrictEqual([200, before.updated_at]);
    expect(await audits('category.update')).toHaveLength(0);
  });

  it('a rename to the name of another non-archived category is 409 already_exists', async () => {
    const kids = await createKids();
    const row = await current(kids);
    const res = await patch(ADMIN, kids, {
      name_mm: 'ဝန်ဆောင်မှု',
      expected_updated_at: row.updated_at,
    });
    expect([res.status, res.body.code]).toStrictEqual([409, ErrorCode.ALREADY_EXISTS]);
  });

  it('name_en null clears the English name', async () => {
    const row = await current(serviceCategories.SERVICES);
    const res = await patch(ADMIN, serviceCategories.SERVICES, {
      name_en: null,
      expected_updated_at: row.updated_at,
    });
    expect([res.status, res.body.name_en]).toStrictEqual([200, null]);
  });

  it('Scenario: Services switched off — the quote answers category_inactive; switched on, 8,000 again', async () => {
    const quote = async () =>
      (
        await t.http
          .post('/api/v1/prices/quote')
          .set('Cookie', cookies[MIN] ?? '')
          .send({
            branch_id: branches.B3,
            location_type: 1,
            date: '2026-10-05',
            employee_id: employees.E005,
            items: [{ service_id: services.HAIRCUT }],
          })
      ).body;
    const off = await patch(ADMIN, serviceCategories.SERVICES, {
      status: ServiceCategoryStatus.INACTIVE,
      expected_updated_at: (await current(serviceCategories.SERVICES)).updated_at,
    });
    expect(off.body.status).toBe(0);
    expect(await quote()).toMatchObject({
      complete: false,
      items: [{ sold: false, reason: ErrorCode.CATEGORY_INACTIVE }],
    });
    const picker = await t.http
      .get(`/api/v1/services?branch_id=${branches.B3}&pricing_mode=1`)
      .set('Cookie', cookies[MIN] ?? '');
    expect(picker.body.items).toStrictEqual([]);
    t.clock?.set(new Date('2026-10-05T10:01:00+06:30'));
    await patch(ADMIN, serviceCategories.SERVICES, {
      status: ServiceCategoryStatus.ACTIVE,
      expected_updated_at: (await current(serviceCategories.SERVICES)).updated_at,
    });
    expect(await quote()).toMatchObject({
      complete: true,
      items: [{ sold: true, unit_price_amount: 8000 }],
    });
  });

  it('status 2 is a 400', async () => {
    const row = await current(serviceCategories.SERVICES);
    const res = await patch(ADMIN, serviceCategories.SERVICES, {
      status: 2,
      expected_updated_at: row.updated_at,
    });
    expect(res.status).toBe(400);
  });
});

describe('Archive a category (task 4.4 · P2.CAT.04 · D-DAT-05 · design D4)', () => {
  it('Scenario: Services is in use — 409 category_in_use with count 3, nothing changes', async () => {
    const res = await post(ADMIN, `/service-categories/${serviceCategories.SERVICES}/archive`);
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      409,
      ErrorCode.CATEGORY_IN_USE,
      { count: 3 },
    ]);
    expect((await current(serviceCategories.SERVICES)).archived_at).toBeNull();
    expect(await audits('category.archive')).toHaveLength(0);
  });

  it('Scenario: An inactive service still counts — count 1', async () => {
    const kids = await createKids();
    await build.service({
      category_id: kids,
      name_mm: 'ကလေးဆံပင်ညှပ်',
      status: ServiceStatus.INACTIVE,
    });
    const res = await post(ADMIN, `/service-categories/${kids}/archive`);
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      409,
      ErrorCode.CATEGORY_IN_USE,
      { count: 1 },
    ]);
  });

  it('an archived service does not count', async () => {
    const kids = await createKids();
    const haircut = await build.service({ category_id: kids, name_mm: 'ကလေးဆံပင်ညှပ်' });
    await build.archive('services', haircut);
    expect((await post(ADMIN, `/service-categories/${kids}/archive`)).status).toBe(200);
  });

  it('Scenario: An empty category — 200 with archived_at, Services only in the list; archive twice keeps the first time', async () => {
    const kids = await createKids();
    const first = await post(ADMIN, `/service-categories/${kids}/archive`);
    expect([first.status, first.body.archived_at]).toStrictEqual([200, NOW]);
    expect((await list()).map((row) => row.name_en)).toStrictEqual(['Services']);
    const [row, ...rest] = await audits('category.archive');
    expect(rest).toStrictEqual([]);
    expect(row).toMatchObject({ branch_id: null, entity_id: kids });
    expect(row?.after_data).toMatchObject({ archived_at: NOW });
    t.clock?.set(new Date('2026-10-05T10:05:00+06:30'));
    const again = await post(ADMIN, `/service-categories/${kids}/archive`);
    expect([again.status, again.body.archived_at]).toStrictEqual([200, NOW]);
    expect(await audits('category.archive')).toHaveLength(1);
  });

  it('Scenario: Editing an archived category — 404 not_found; an unknown id — 404', async () => {
    const kids = await createKids();
    const row = await current(kids);
    await post(ADMIN, `/service-categories/${kids}/archive`);
    const res = await patch(ADMIN, kids, {
      name_en: 'Little',
      expected_updated_at: row.updated_at,
    });
    expect([res.status, res.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
    const unknown = await post(
      ADMIN,
      '/service-categories/0199a3f2-0000-7000-8004-0000000000ff/archive',
    );
    expect([unknown.status, unknown.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
  });
});

describe('Reorder the categories (task 4.5 · P2.CAT.05 · design D7)', () => {
  it('Scenario: Categories in a new order — 200 with Kids 1 and Services 2, one audit row', async () => {
    const kids = await createKids();
    const res = await put(ADMIN, { ids: [kids, serviceCategories.SERVICES] });
    expect(res.status).toBe(200);
    expect(
      res.body.items.map((row: { id: string; sort_order: number }) => [row.id, row.sort_order]),
    ).toStrictEqual([
      [kids, 1],
      [serviceCategories.SERVICES, 2],
    ]);
    expect((await list()).map((row) => row.name_en)).toStrictEqual(['Kids', 'Services']);
    const [row, ...rest] = await audits('category.reorder');
    expect(rest).toStrictEqual([]);
    expect(row).toMatchObject({ branch_id: null });
    expect(row?.before_data).toStrictEqual({ ids: [serviceCategories.SERVICES, kids] });
    expect(row?.after_data).toStrictEqual({ ids: [kids, serviceCategories.SERVICES] });
  });

  it.each([
    ['a category is missing', (kids: string) => [kids]],
    ['an id is repeated', (kids: string) => [kids, kids, serviceCategories.SERVICES]],
    [
      'an id is unknown',
      (kids: string) => [kids, serviceCategories.SERVICES, '0199a3f2-0000-7000-8004-0000000000ff'],
    ],
  ])('Scenario: %s — 400 validation on ids and nothing changes', async (_name, ids) => {
    const kids = await createKids();
    const before = await list();
    const res = await put(ADMIN, { ids: ids(kids) });
    expect([res.status, res.body.code, res.body.errors[0].field]).toStrictEqual([
      400,
      ErrorCode.VALIDATION,
      'ids',
    ]);
    expect(await list()).toStrictEqual(before);
    expect(await audits('category.reorder')).toHaveLength(0);
  });

  it('an archived category in the body is a 400', async () => {
    const kids = await createKids();
    await post(ADMIN, `/service-categories/${kids}/archive`);
    const res = await put(ADMIN, { ids: [kids, serviceCategories.SERVICES] });
    expect([res.status, res.body.errors[0].field]).toStrictEqual([400, 'ids']);
  });

  it('the order of equal positions is made distinct: positions 1 … n', async () => {
    const a = await build.category({ name_mm: 'ဘ', sort_order: 4 });
    const b = await build.category({ name_mm: 'ဂ', sort_order: 4 });
    const res = await put(ADMIN, { ids: [serviceCategories.SERVICES, b, a] });
    expect(res.body.items.map((row: { sort_order: number }) => row.sort_order)).toStrictEqual([
      1, 2, 3,
    ]);
  });
});
