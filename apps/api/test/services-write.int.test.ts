import { randomUUID } from 'node:crypto';

import { ErrorCode, ScopeType, ServiceCategoryStatus, ServiceStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type CatalogueBuilder, catalogueBuilder } from './helpers/catalogue.js';
import {
  type CatalogueSnapshot,
  restoreCatalogue,
  snapshotCatalogue,
} from './helpers/catalogue-reset.js';
import { assignRole } from './helpers/roles.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';
import { walkinHttp } from './helpers/walkin-http.js';

// add-service-catalogue tasks 5.1 – 5.3 and 5.6 — the service endpoints P2.SVC.02 / 04 / 07 (the archive,
// P2.SVC.05 with the close of the price rows, follows in the next part)
// (services-pricing spec "Company master writes need a company-scope grant", "Create a service", "Option pricing
// is not set through these endpoints", "A service's category is never an archived one", "Edit a service's
// details and website fields", "An inactive service is not sold from now", "A reorder
// lists every non-archived sibling once", "Every catalogue write leaves one audit row"). Monday 05/Oct/2026 at
// 10:00 AM MMT on the fixture catalogue: Services (1) with Haircut, Shave and Hair wash sold at B1 – B3.
const { serviceCategories, branches, services, employees } = FIXTURE_IDS;
const NOW = '2026-10-05T10:00:00+06:30';
const API = '/api/v1';
// "No. 3, Example Road" in Myanmar typed with a Zawgyi keyboard (detector probability ≥ 0.95).
const ZAWGYI = 'အမွတ္ ၃၊ စမ္းသပ္လမ္း';

let t: SeededApp;
let build: CatalogueBuilder;
let snapshot: CatalogueSnapshot;
const cookies: Record<string, string> = {};

const ADMIN = 'E001';
const HNIN = 'E002';
const ZAW = 'E003';
const AUNG = 'E004';
const MIN = 'E005';

beforeAll(async () => {
  t = await startSeededApp({ now: new Date(NOW) });
  build = await catalogueBuilder(t.prisma);
  snapshot = await snapshotCatalogue(t.prisma);
  // The seed Manager holds service.view and service.update only; the create and archive reach scenarios assume
  // the codes ticked at branch scope by an admin, so Ma Hnin (B3) and Ko Zaw (B1) get a test role with them.
  for (const [employeeId, branchId] of [
    [employees.E002, branches.B3],
    [employees.E003, branches.B1],
  ] as const) {
    await assignRole(t.prisma, {
      name: 'Catalogue master (test)',
      employeeId,
      codes: ['service.create', 'service.delete'],
      scope: ScopeType.BRANCHES,
      branchIds: [branchId],
    });
  }
  for (const who of [ADMIN, HNIN, ZAW, AUNG, MIN] as const)
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
  // The services the endpoints made go first (they point at the builder's categories), then the builder's rows.
  await restoreCatalogue(t.prisma, snapshot);
  await build.cleanup();
  await t.prisma.service_categories.updateMany({
    where: { id: serviceCategories.SERVICES },
    data: { status: ServiceCategoryStatus.ACTIVE, archived_at: null },
  });
});

const call = (
  method: 'post' | 'patch' | 'put' | 'get',
  who: string,
  path: string,
  body?: object,
) => {
  const request = t.http[method](`${API}${path}`).set('Cookie', cookies[who] ?? '');
  return method === 'get' ? request : request.send(body ?? {});
};
const post = (who: string, path: string, body?: object) => call('post', who, path, body);
const patch = (who: string, path: string, body: object) => call('patch', who, path, body);
const put = (who: string, path: string, body: object) => call('put', who, path, body);
const get = (who: string, path: string) => call('get', who, path);

const newAudits = async (action?: string) =>
  (
    await t.prisma.audit_events.findMany({
      where: { action: action ?? { startsWith: 'service.' } },
      orderBy: { id: 'asc' },
    })
  ).filter((row) => !known.has(row.id));
const names = (body: { items: { name_en: string | null }[] }) =>
  body.items.map((item) => item.name_en);
const detail = async (id: string) => (await get(ADMIN, `/services/${id}`)).body;
const KIDS = { name_mm: 'ကလေး', name_en: 'Kids', sort_order: 2 };
const KIDS_HAIRCUT = (category_id: string, extra: object = {}) => ({
  category_id,
  name_mm: 'ကလေးဆံပင်ညှပ်',
  name_en: 'Kids haircut',
  pricing_mode: 1,
  ...extra,
});
const AT_B3 = [{ branch_id: branches.B3, sold: true, duration_minutes: 20 }];
const quote = async (item: string = services.HAIRCUT) =>
  (
    await post(MIN, '/prices/quote', {
      branch_id: branches.B3,
      location_type: 1,
      date: '2026-10-05',
      employee_id: employees.E005,
      items: [{ service_id: item }],
    })
  ).body;

describe('The reach of P2.SVC.02 / 04 / 07 (task 5.1 · P2-RULE-01 · API-PERM-07 · CG-TEST-05)', () => {
  const routes = [
    [
      'create',
      'service.create',
      () => post,
      '/services',
      () => KIDS_HAIRCUT(serviceCategories.SERVICES),
    ],
    [
      'update',
      'service.update',
      () => patch,
      `/services/${services.HAIRCUT}`,
      () => ({ buffer_minutes: 5, expected_updated_at: '2026-10-05T09:00:00.000+06:30' }),
    ],
    [
      'reorder',
      'service.update',
      () => put,
      '/services/order',
      () => ({ category_id: serviceCategories.SERVICES, ids: [services.SHAVE, services.HAIRCUT] }),
    ],
  ] as const;

  it.each(routes)(
    'Scenario: %s — a branch Manager → 403 company_scope_required, Ko Aung → 403 forbidden with the code; nothing written',
    async (_name, code, verb, path, body) => {
      const before = await snapshotCatalogue(t.prisma);
      const send = (who: string) => verb()(who, path, body());
      for (const manager of [HNIN, ZAW]) {
        const res = await send(manager);
        expect([res.status, res.body.code]).toStrictEqual([403, ErrorCode.COMPANY_SCOPE_REQUIRED]);
      }
      const barber = await send(AUNG);
      expect([barber.status, barber.body.code, barber.body.context]).toStrictEqual([
        403,
        ErrorCode.FORBIDDEN,
        { required: code },
      ]);
      expect(await snapshotCatalogue(t.prisma)).toStrictEqual(before);
      expect(await t.prisma.services.count()).toBe(3);
      expect(await newAudits()).toHaveLength(0);
    },
  );

  it('Scenario: The Admin at company scope — create 201, update 200, reorder 200', async () => {
    const created = await post(ADMIN, '/services', KIDS_HAIRCUT(serviceCategories.SERVICES));
    expect(created.status).toBe(201);
    const row = await detail(created.body.id);
    expect(
      (
        await patch(ADMIN, `/services/${row.id}`, {
          buffer_minutes: 5,
          expected_updated_at: row.updated_at,
        })
      ).status,
    ).toBe(200);
    const order = [services.SHAVE, services.HAIRCUT, services.HAIR_WASH, row.id];
    expect(
      (await put(ADMIN, '/services/order', { category_id: serviceCategories.SERVICES, ids: order }))
        .status,
    ).toBe(200);
  });
});

describe('Create a service (task 5.2 · P2.SVC.02 · SC2 ★ · SC3 ★ · design D7 / D8 / D9)', () => {
  it('Scenario: Kids haircut at B3 — 201 with Location, unpriced B3, 20 / 20, one audit row', async () => {
    const kids = await build.category(KIDS);
    const res = await post(
      ADMIN,
      '/services',
      KIDS_HAIRCUT(kids, { buffer_minutes: 5, branches: AT_B3 }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`${API}/services/${res.body.id}`);
    expect(res.body).toMatchObject({
      category_id: kids,
      status: 1,
      buffer_minutes: 5,
      show_on_website: true,
      branch_ids: [branches.B3],
      unpriced_branch_ids: [branches.B3],
      duration_range: { min: 20, max: 20 },
      branches: [{ branch_id: branches.B3, sold: true, duration_minutes: 20 }],
      options: { groups: [], variants: [] },
    });
    const [row, ...rest] = await newAudits('service.create');
    expect(rest).toStrictEqual([]);
    expect(row).toMatchObject({ branch_id: null, entity_id: res.body.id });
  });

  it('Scenario: No branches yet — branch_ids [] and a 0 / 0 duration range', async () => {
    const kids = await build.category(KIDS);
    const res = await post(ADMIN, '/services', KIDS_HAIRCUT(kids));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      branch_ids: [],
      branches: [],
      duration_range: { min: 0, max: 0 },
    });
  });

  it('Scenario: A new service comes after Hair wash — sort_order 4, last in the B3 list', async () => {
    const res = await post(
      ADMIN,
      '/services',
      KIDS_HAIRCUT(serviceCategories.SERVICES, { branches: AT_B3 }),
    );
    expect(res.body.sort_order).toBe(4);
    // The API list shows it (the POS leaves it out until it has a price — unpriced_branch_ids).
    expect(names((await get(MIN, `/services?branch_id=${branches.B3}`)).body)).toStrictEqual([
      'Haircut',
      'Shave',
      'Hair wash',
      'Kids haircut',
    ]);
  });

  it('Scenario: Buffer at 120 is 201, one minute over is 400 too_big with maximum 120', async () => {
    const kids = await build.category(KIDS);
    expect(
      (await post(ADMIN, '/services', KIDS_HAIRCUT(kids, { buffer_minutes: 120 }))).status,
    ).toBe(201);
    const over = await post(
      ADMIN,
      '/services',
      KIDS_HAIRCUT(kids, { name_mm: 'အခြား', buffer_minutes: 121 }),
    );
    expect([over.status, over.body.code, over.body.errors[0]]).toStrictEqual([
      400,
      ErrorCode.VALIDATION,
      { field: 'buffer_minutes', code: 'too_big', params: { maximum: 120 } },
    ]);
  });

  it.each([
    [0, 400, 'too_small'],
    [1, 201, undefined],
    [1440, 201, undefined],
    [1441, 400, 'too_big'],
  ])(
    'Scenario: Duration bounds — %i minutes answers %i',
    async (duration_minutes, status, code) => {
      const kids = await build.category(KIDS);
      const res = await post(
        ADMIN,
        '/services',
        KIDS_HAIRCUT(kids, {
          branches: [{ branch_id: branches.B3, sold: true, duration_minutes }],
        }),
      );
      expect(res.status).toBe(status);
      if (code !== undefined) expect(res.body.errors[0].code).toBe(code);
      if (status === 400) expect(await t.prisma.services.count()).toBe(3);
    },
  );

  it('Scenario: A Myanmar name of 201 characters is 400 too_big with maximum 200, nothing created', async () => {
    const res = await post(
      ADMIN,
      '/services',
      KIDS_HAIRCUT(serviceCategories.SERVICES, { name_mm: 'က'.repeat(201) }),
    );
    expect([res.status, res.body.errors[0].code, res.body.errors[0].params]).toStrictEqual([
      400,
      'too_big',
      { maximum: 200 },
    ]);
    expect(await t.prisma.services.count()).toBe(3);
  });

  it('Scenario: Hair colour as an option service — 422 options_required and no service', async () => {
    const res = await post(ADMIN, '/services', {
      category_id: serviceCategories.SERVICES,
      name_mm: 'ဆံပင်ဆေးဆိုး',
      name_en: 'Hair colour',
      pricing_mode: 2,
    });
    expect([res.status, res.body.code]).toStrictEqual([422, ErrorCode.OPTIONS_REQUIRED]);
    expect(await t.prisma.services.count()).toBe(3);
  });

  it('Scenario: Into an archived or unknown category — 422 category_inactive and no service', async () => {
    const kids = await build.category(KIDS);
    await build.archive('service_categories', kids);
    for (const category of [kids, randomUUID()]) {
      const res = await post(ADMIN, '/services', KIDS_HAIRCUT(category));
      expect([res.status, res.body.code]).toStrictEqual([422, ErrorCode.CATEGORY_INACTIVE]);
    }
    expect(await t.prisma.services.count()).toBe(3);
    expect(await newAudits('service.create')).toHaveLength(0);
  });

  it('Scenario: Into an inactive category — 201, and the picker at B3 does not return it', async () => {
    const kids = await build.category({ ...KIDS, status: ServiceCategoryStatus.INACTIVE });
    const res = await post(ADMIN, '/services', KIDS_HAIRCUT(kids, { branches: AT_B3 }));
    expect(res.status).toBe(201);
    expect(names((await get(MIN, `/services?branch_id=${branches.B3}`)).body)).toStrictEqual([
      'Haircut',
      'Shave',
      'Hair wash',
    ]);
  });

  it('Scenario: Duplicate service — 409 already_exists; the name of an archived service is free again', async () => {
    const dup = await post(
      ADMIN,
      '/services',
      KIDS_HAIRCUT(serviceCategories.SERVICES, { name_mm: 'ဆံပင်ညှပ်' }),
    );
    expect([dup.status, dup.body.code]).toStrictEqual([409, ErrorCode.ALREADY_EXISTS]);
    const hairWash = await detail(services.HAIR_WASH);
    await build.archive('services', services.HAIR_WASH);
    t.clock?.set(new Date('2026-10-05T10:05:00+06:30'));
    const again = await post(
      ADMIN,
      '/services',
      KIDS_HAIRCUT(serviceCategories.SERVICES, { name_mm: hairWash.name_mm, name_en: 'Hair wash' }),
    );
    expect([again.status, again.body.id === services.HAIR_WASH]).toStrictEqual([201, false]);
    expect((await detail(services.HAIR_WASH)).archived_at).toBe(NOW);
  });

  it('Zawgyi text in any text member — 400 zawgyi_text naming it, nothing written (API-SHAPE-05)', async () => {
    const res = await post(
      ADMIN,
      '/services',
      KIDS_HAIRCUT(serviceCategories.SERVICES, { name_mm: ZAWGYI, public_description_en: ZAWGYI }),
    );
    expect([res.status, res.body.code, res.body.errors]).toStrictEqual([
      400,
      ErrorCode.ZAWGYI_TEXT,
      [
        { field: 'name_mm', code: ErrorCode.ZAWGYI_TEXT },
        { field: 'public_description_en', code: ErrorCode.ZAWGYI_TEXT },
      ],
    ]);
    expect(await t.prisma.services.count()).toBe(3);
  });
});

describe('Edit a service (task 5.3 · P2.SVC.04 · API-IDEM-04 · P2-RULE-03 · D-SVC-04)', () => {
  const edit = async (id: string, body: object) =>
    patch(ADMIN, `/services/${id}`, {
      ...body,
      expected_updated_at: (await detail(id)).updated_at,
    });

  it('every member — 200 with the full Service and warnings [], one audit row with the changed members', async () => {
    const before = await detail(services.HAIRCUT);
    t.clock?.set(new Date('2026-10-05T10:05:00+06:30'));
    const res = await edit(services.HAIRCUT, {
      name_mm: 'ဆံပင်ညှပ်ပေး',
      name_en: 'Cut',
      description_mm: 'ဖော်ပြချက်',
      description_en: 'Description',
      public_description_mm: 'အများသိ',
      public_description_en: 'Public',
      buffer_minutes: 10,
      show_on_website: false,
      status: ServiceStatus.INACTIVE,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: services.HAIRCUT,
      name_mm: 'ဆံပင်ညှပ်ပေး',
      name_en: 'Cut',
      description_en: 'Description',
      public_description_en: 'Public',
      buffer_minutes: 10,
      show_on_website: false,
      status: 0,
      updated_at: '2026-10-05T10:05:00.000+06:30',
      warnings: [],
    });
    const [row, ...rest] = await newAudits('service.update');
    expect(rest).toStrictEqual([]);
    expect(row).toMatchObject({ branch_id: null, entity_id: services.HAIRCUT });
    expect(row?.before_data).toMatchObject({
      name_en: before.name_en,
      buffer_minutes: 0,
      status: 1,
    });
    expect(row?.after_data).toMatchObject({ name_en: 'Cut', buffer_minutes: 10, status: 0 });
  });

  it('Scenario: A buffer for Haircut — the quote reads it from the next request: 30 + 5 = 35', async () => {
    expect((await edit(services.HAIRCUT, { buffer_minutes: 5 })).status).toBe(200);
    expect(await quote()).toMatchObject({
      items: [{ duration_minutes: 30, buffer_minutes: 5 }],
      block_minutes: 35,
    });
  });

  it('Scenario: Website texts — both values are kept and Ko Min’s picker still offers Haircut', async () => {
    const res = await edit(services.HAIRCUT, {
      show_on_website: false,
      public_description_en: 'Classic cut with a hot towel',
    });
    expect(res.body).toMatchObject({
      show_on_website: false,
      public_description_en: 'Classic cut with a hot towel',
    });
    expect(names((await get(MIN, `/services?branch_id=${branches.B3}`)).body)).toContain('Haircut');
  });

  it('Scenario: A stale save — 409 conflict and the first values stay; no token is a 400', async () => {
    const first = await detail(services.HAIRCUT);
    t.clock?.set(new Date('2026-10-05T10:01:00+06:30'));
    expect(
      (
        await patch(ADMIN, `/services/${services.HAIRCUT}`, {
          buffer_minutes: 5,
          expected_updated_at: first.updated_at,
        })
      ).status,
    ).toBe(200);
    const stale = await patch(ADMIN, `/services/${services.HAIRCUT}`, {
      buffer_minutes: 9,
      expected_updated_at: first.updated_at,
    });
    expect([stale.status, stale.body.code]).toStrictEqual([409, ErrorCode.CONFLICT]);
    expect((await detail(services.HAIRCUT)).buffer_minutes).toBe(5);
    const bare = await patch(ADMIN, `/services/${services.HAIRCUT}`, { buffer_minutes: 9 });
    expect([bare.status, bare.body.errors[0].field]).toStrictEqual([400, 'expected_updated_at']);
  });

  it('Scenario: Nothing changed — 200, the same updated_at, no audit row', async () => {
    const before = await detail(services.HAIRCUT);
    t.clock?.set(new Date('2026-10-05T10:05:00+06:30'));
    const res = await edit(services.HAIRCUT, { name_en: before.name_en });
    expect([res.status, res.body.updated_at]).toStrictEqual([200, before.updated_at]);
    expect(await newAudits('service.update')).toHaveLength(0);
  });

  it('Scenario: Switching Haircut to options — 422 use_options_endpoint and it keeps pricing_mode 1', async () => {
    const res = await edit(services.HAIRCUT, { pricing_mode: 2 });
    expect([res.status, res.body.code]).toStrictEqual([422, ErrorCode.USE_OPTIONS_ENDPOINT]);
    expect((await detail(services.HAIRCUT)).pricing_mode).toBe(1);
    expect(await newAudits('service.update')).toHaveLength(0);
  });

  it('Scenario: A moved service goes to the end of its new category — Shave is 2 inside Kids', async () => {
    const kids = await build.category({ ...KIDS, sort_order: 1 });
    await build.service({ category_id: kids, name_mm: 'ကလေးဆံပင်ညှပ်', sort_order: 1 });
    const res = await edit(services.SHAVE, { category_id: kids });
    expect([res.status, res.body.category_id, res.body.sort_order]).toStrictEqual([200, kids, 2]);
  });

  it('Scenario: Moving into an archived or unknown category — 422 category_inactive, Shave stays', async () => {
    const kids = await build.category(KIDS);
    await build.archive('service_categories', kids);
    for (const category of [kids, randomUUID()]) {
      const res = await edit(services.SHAVE, { category_id: category });
      expect([res.status, res.body.code]).toStrictEqual([422, ErrorCode.CATEGORY_INACTIVE]);
    }
    expect((await detail(services.SHAVE)).category_id).toBe(serviceCategories.SERVICES);
  });

  it('Scenario: Duplicate service — renaming Shave to the name of Haircut is 409 already_exists', async () => {
    const shave = await detail(services.SHAVE);
    const haircut = await detail(services.HAIRCUT);
    const res = await edit(services.SHAVE, { name_mm: haircut.name_mm });
    expect([res.status, res.body.code]).toStrictEqual([409, ErrorCode.ALREADY_EXISTS]);
    expect((await detail(services.SHAVE)).name_mm).toBe(shave.name_mm);
  });

  it('Scenario: Editing an archived service — 404 not_found; an unknown or malformed id too', async () => {
    const row = await detail(services.HAIR_WASH);
    await build.archive('services', services.HAIR_WASH);
    const archived = await patch(ADMIN, `/services/${services.HAIR_WASH}`, {
      name_en: 'Wash',
      expected_updated_at: row.updated_at,
    });
    expect([archived.status, archived.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
    for (const id of [randomUUID(), 'not-a-uuid']) {
      const res = await patch(ADMIN, `/services/${id}`, {
        name_en: 'x',
        expected_updated_at: row.updated_at,
      });
      expect(res.status).toBe(404);
    }
  });

  it('Zawgyi text in a rename — 400 zawgyi_text, the row and its token stay', async () => {
    const before = await detail(services.HAIRCUT);
    const res = await edit(services.HAIRCUT, { name_en: ZAWGYI });
    expect([res.status, res.body.code]).toStrictEqual([400, ErrorCode.ZAWGYI_TEXT]);
    expect(await detail(services.HAIRCUT)).toStrictEqual(before);
  });

  it('Scenario: Shave switched off — the picker and the quote leave it out; on again, 3,000', async () => {
    expect((await edit(services.SHAVE, { status: ServiceStatus.INACTIVE })).status).toBe(200);
    expect(names((await get(AUNG, `/services?branch_id=${branches.B3}`)).body)).toStrictEqual([
      'Haircut',
      'Hair wash',
    ]);
    expect(await quote(services.SHAVE)).toMatchObject({
      items: [{ sold: false, reason: ErrorCode.SERVICE_INACTIVE }],
    });
    t.clock?.set(new Date('2026-10-05T10:01:00+06:30'));
    expect((await edit(services.SHAVE, { status: ServiceStatus.ACTIVE })).status).toBe(200);
    expect(await quote(services.SHAVE)).toMatchObject({
      items: [{ sold: true, unit_price_amount: 3000 }],
    });
  });

  it('Scenario: Shave switched off during a sale — the OPEN sale keeps 11,000, a new Shave line is refused, FINISH works', async () => {
    const api = walkinHttp(t);
    const cash = (await t.prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
    const visit = await api.start('E005', [services.HAIRCUT, services.SHAVE]);
    const sale = visit.sale?.id ?? '';
    expect((await api.get('E005', `/sales/${sale}`)).body.total_amount).toBe(11_000);
    expect((await edit(services.SHAVE, { status: ServiceStatus.INACTIVE })).status).toBe(200);
    const again = await api.post('E005', `/sales/${sale}/items`, {
      line_type: 1,
      service_id: services.SHAVE,
    });
    expect([again.status, again.body.code]).toStrictEqual([422, ErrorCode.SERVICE_INACTIVE]);
    expect((await api.get('E005', `/sales/${sale}`)).body.total_amount).toBe(11_000);
    await api.complete('E005', visit.id);
    await api.pay('E005', sale, { payment_method_id: cash, amount: 11_000 });
    const finished = await api.finish('E005', sale, { expected_total_amount: 11_000 });
    expect(finished.total_amount).toBe(11_000);
  });
});

describe('Reorder the services of a category (task 5.6 · P2.SVC.07 · design D7)', () => {
  let kidsHaircut = '';
  const order = (...ids: string[]) => ({ category_id: serviceCategories.SERVICES, ids });
  const positions = async () =>
    (await t.prisma.services.findMany({ where: { id: { in: Object.values(services) } } }))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row) => row.id);

  it('Scenario: Services in a new order — 200 with Shave 1, Haircut 2, Hair wash 3; the START chips follow', async () => {
    const res = await put(
      ADMIN,
      '/services/order',
      order(services.SHAVE, services.HAIRCUT, services.HAIR_WASH),
    );
    expect(res.status).toBe(200);
    expect(
      res.body.items.map((item: { id: string; sort_order: number }) => [item.id, item.sort_order]),
    ).toStrictEqual([
      [services.SHAVE, 1],
      [services.HAIRCUT, 2],
      [services.HAIR_WASH, 3],
    ]);
    expect(names((await get(AUNG, `/services?branch_id=${branches.B3}`)).body)).toStrictEqual([
      'Shave',
      'Haircut',
      'Hair wash',
    ]);
    const [row, ...rest] = await newAudits('service.reorder');
    expect(rest).toStrictEqual([]);
    expect(row).toMatchObject({ branch_id: null });
    expect(row?.after_data).toStrictEqual({
      category_id: serviceCategories.SERVICES,
      ids: [services.SHAVE, services.HAIRCUT, services.HAIR_WASH],
    });
  });

  it.each([
    ['a service is missing', () => order(services.SHAVE, services.HAIRCUT)],
    [
      'a service of another category is added',
      () => order(services.SHAVE, services.HAIRCUT, services.HAIR_WASH, kidsHaircut),
    ],
    [
      'an id is repeated',
      () => order(services.SHAVE, services.SHAVE, services.HAIRCUT, services.HAIR_WASH),
    ],
    [
      'an id is unknown',
      () => order(services.SHAVE, services.HAIRCUT, services.HAIR_WASH, randomUUID()),
    ],
  ])('Scenario: %s — 400 validation on ids and the positions stay 1, 2, 3', async (_name, body) => {
    const kids = await build.category(KIDS);
    kidsHaircut = await build.service({ category_id: kids, name_mm: 'ကလေးဆံပင်ညှပ်' });
    const res = await put(ADMIN, '/services/order', body());
    expect([res.status, res.body.code, res.body.errors[0].field]).toStrictEqual([
      400,
      ErrorCode.VALIDATION,
      'ids',
    ]);
    expect(await positions()).toStrictEqual([services.HAIRCUT, services.SHAVE, services.HAIR_WASH]);
    expect(await newAudits('service.reorder')).toHaveLength(0);
  });

  it('an archived service in the ids is a 400; an archived or unknown category is 404 not_found', async () => {
    await build.archive('services', services.HAIR_WASH);
    const withArchived = await put(
      ADMIN,
      '/services/order',
      order(services.HAIRCUT, services.SHAVE, services.HAIR_WASH),
    );
    expect([withArchived.status, withArchived.body.errors[0].field]).toStrictEqual([400, 'ids']);
    const kids = await build.category(KIDS);
    await build.archive('service_categories', kids);
    for (const category_id of [kids, randomUUID()]) {
      const res = await put(ADMIN, '/services/order', { category_id, ids: [randomUUID()] });
      expect([res.status, res.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
    }
  });
});
