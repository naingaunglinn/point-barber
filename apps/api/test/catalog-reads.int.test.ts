import { ErrorCode, ServiceCategoryStatus, ServiceStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type CatalogueBuilder, catalogueBuilder } from './helpers/catalogue.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-service-catalogue tasks 3.2 – 3.5 — the reads of the two lists and of one service (services-pricing
// spec "Management filters of the two lists", "An inactive category hides its services from staff
// pickers", "Catalogue order is category order, then service order", "Read one service" · P2.CAT.01 ·
// P2.SVC.01 · P2.SVC.03 · P2-RULE-11 · API-PERM-03). Monday 05/Oct/2026 10:00 AM MMT, the fixture
// catalogue: Services (1) with Haircut, Shave, Hair wash sold at B1 – B3 for 30 / 15 / 10 minutes.
const { branches, services, serviceCategories } = FIXTURE_IDS;
const ADMIN = 'E001'; // U Kyaw Zin — company scope, the four service.* codes
const HNIN = 'E002'; // Ma Hnin — Manager B3: service.view, service.update
const AUNG = 'E004'; // Ko Aung — Barber B3: no service.* code
const MIN = 'E005'; // Ko Min — Barber B3

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;
let build: CatalogueBuilder;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:00:00+06:30'));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
  build = await catalogueBuilder(prisma);
});
afterAll(() => s.close());
afterEach(async () => {
  await build.cleanup();
  await prisma.service_categories.update({
    where: { id: serviceCategories.SERVICES },
    data: { status: ServiceCategoryStatus.ACTIVE, sort_order: 1, archived_at: null },
  });
  await prisma.services.updateMany({
    where: { id: { in: Object.values(services) } },
    data: { status: ServiceStatus.ACTIVE, archived_at: null },
  });
});

const names = (body: { items: { name_en: string | null }[] }) =>
  body.items.map((item) => item.name_en);

describe('The conditional management check (task 3.2 · P2-RULE-11 · API-PERM-03)', () => {
  it('Scenario: A barber asks for archived rows — 403 forbidden, context.required service.view', async () => {
    for (const path of [
      '/services?include_archived=true',
      '/service-categories?include_archived=true',
    ]) {
      const res = await api.get(AUNG, path);
      expect([res.status, res.body.code, res.body.context], path).toStrictEqual([
        403,
        ErrorCode.FORBIDDEN,
        { required: 'service.view' },
      ]);
    }
  });

  it('Scenario: A barber asks for sold=all — 403 forbidden, context.required service.view', async () => {
    const res = await api.get(AUNG, `/services?branch_id=${branches.B3}&sold=all`);
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      403,
      ErrorCode.FORBIDDEN,
      { required: 'service.view' },
    ]);
  });

  it('Scenario: The Manager asks for archived rows — 200 with the archived service', async () => {
    await build.archive('services', services.HAIR_WASH);
    const res = await api.get(HNIN, '/services?include_archived=true');
    expect(res.status).toBe(200);
    expect(names(res.body)).toStrictEqual(['Haircut', 'Shave', 'Hair wash']);
    expect(res.body.items.at(-1).archived_at).toBe('2026-10-05T10:00:00+06:30');
    const without = await api.get(HNIN, '/services');
    expect(names(without.body)).toStrictEqual(['Haircut', 'Shave']);
  });

  it('Scenario: A barber asks for inactive services — 200 with Shave', async () => {
    await prisma.services.update({
      where: { id: services.SHAVE },
      data: { status: ServiceStatus.INACTIVE },
    });
    const res = await api.get(AUNG, '/services?status=0');
    expect(res.status).toBe(200);
    expect(names(res.body)).toStrictEqual(['Shave']);
  });

  it('archived categories are listed with include_archived only', async () => {
    const kids = await build.category({ name_mm: 'ကလေး', name_en: 'Kids', sort_order: 2 });
    await build.archive('service_categories', kids);
    expect(names((await api.get(HNIN, '/service-categories')).body)).toStrictEqual(['Services']);
    expect(
      names((await api.get(HNIN, '/service-categories?include_archived=true')).body),
    ).toStrictEqual(['Services', 'Kids']);
  });
});

describe('The picker view and catalogue order (task 3.3 · Recorded readings 1 and 2)', () => {
  it('Scenario: Services switched off — the picker request is empty, the status=1 request lists three', async () => {
    await prisma.service_categories.update({
      where: { id: serviceCategories.SERVICES },
      data: { status: ServiceCategoryStatus.INACTIVE },
    });
    const picker = await api.get(MIN, `/services?branch_id=${branches.B3}&pricing_mode=1`);
    expect(picker.body.items).toStrictEqual([]);
    const admin = await api.get(ADMIN, `/services?branch_id=${branches.B3}&status=1`);
    expect(names(admin.body)).toStrictEqual(['Haircut', 'Shave', 'Hair wash']);
    expect(admin.body.items.map((item: { status: number }) => item.status)).toStrictEqual([
      1, 1, 1,
    ]);
    // The category list of a picker leaves the inactive category out; an explicit status shows it.
    expect((await api.get(MIN, '/service-categories')).body.items).toStrictEqual([]);
    expect(names((await api.get(ADMIN, '/service-categories?status=0')).body)).toStrictEqual([
      'Services',
    ]);
  });

  it('Scenario: Switched on again — the picker offers Haircut again', async () => {
    await prisma.service_categories.update({
      where: { id: serviceCategories.SERVICES },
      data: { status: ServiceCategoryStatus.INACTIVE },
    });
    await prisma.service_categories.update({
      where: { id: serviceCategories.SERVICES },
      data: { status: ServiceCategoryStatus.ACTIVE },
    });
    const res = await api.get(MIN, `/services?branch_id=${branches.B3}`);
    expect(names(res.body)).toStrictEqual(['Haircut', 'Shave', 'Hair wash']);
  });

  it('Scenario: Kids before Services — Kids haircut, Haircut, Shave, Hair wash', async () => {
    await prisma.service_categories.update({
      where: { id: serviceCategories.SERVICES },
      data: { sort_order: 2 },
    });
    const kids = await build.category({ name_mm: 'ကလေး', name_en: 'Kids', sort_order: 1 });
    await build.service({
      category_id: kids,
      name_mm: 'ကလေးဆံပင်ညှပ်',
      name_en: 'Kids haircut',
      sort_order: 1,
      sold_at: [{ branch_id: branches.B3, duration_minutes: 20 }],
    });
    const res = await api.get(MIN, `/services?branch_id=${branches.B3}`);
    expect(names(res.body)).toStrictEqual(['Kids haircut', 'Haircut', 'Shave', 'Hair wash']);
    expect(names(await (await api.get(MIN, '/service-categories')).body)).toStrictEqual([
      'Kids',
      'Services',
    ]);
  });

  it('Scenario: Equal positions — two services at sort_order 4 follow Hair wash by name_mm, then id', async () => {
    const [first, second] = ['ကျောနှိပ်', 'ခေါင်းနှိပ်'];
    for (const name_mm of [second, first]) {
      await build.service({
        category_id: serviceCategories.SERVICES,
        name_mm: name_mm ?? '',
        name_en: name_mm,
        sort_order: 4,
        sold_at: [{ branch_id: branches.B3, duration_minutes: 20 }],
      });
    }
    const res = await api.get(MIN, `/services?branch_id=${branches.B3}`);
    expect(names(res.body)).toStrictEqual(['Haircut', 'Shave', 'Hair wash', first, second]);
  });

  it('categories with equal positions are ordered by name_mm, then id', async () => {
    await build.category({ name_mm: 'ဘ', name_en: 'Second', sort_order: 1 });
    await build.category({ name_mm: 'ဂ', name_en: 'First', sort_order: 1 });
    const res = await api.get(MIN, '/service-categories');
    // 'ဂ' < 'ဘ' < 'ဝန်ဆောင်မှု' in code point order.
    expect(names(res.body)).toStrictEqual(['First', 'Second', 'Services']);
  });
});

describe('include_counts and sold=all (task 3.4 · P2.CAT.01 · P2.SVC.01 · Recorded reading 6)', () => {
  it('Scenario: Counts for the category panel — Services has 3, an archived service is not counted', async () => {
    const counts = async () =>
      (await api.get(ADMIN, '/service-categories?include_counts=true')).body.items;
    expect(await counts()).toMatchObject([{ id: serviceCategories.SERVICES, service_count: 3 }]);
    await build.archive('services', services.HAIR_WASH);
    expect(await counts()).toMatchObject([{ service_count: 2 }]);
    // An inactive service still counts: it is what category_in_use reports.
    await prisma.services.update({
      where: { id: services.SHAVE },
      data: { status: ServiceStatus.INACTIVE },
    });
    expect(await counts()).toMatchObject([{ service_count: 2 }]);
  });

  it('without include_counts no category carries service_count', async () => {
    const res = await api.get(ADMIN, '/service-categories');
    expect(res.body.items[0]).not.toHaveProperty('service_count');
  });

  it('Scenario: What B3 sells — Kids haircut sold at B1 only has sold_here false at B3', async () => {
    const kids = await build.category({ name_mm: 'ကလေး', name_en: 'Kids', sort_order: 2 });
    await build.service({
      category_id: kids,
      name_mm: 'ကလေးဆံပင်ညှပ်',
      name_en: 'Kids haircut',
      sort_order: 1,
      sold_at: [{ branch_id: branches.B1, duration_minutes: 20 }],
    });
    const res = await api.get(HNIN, `/services?branch_id=${branches.B3}&sold=all`);
    expect(res.status).toBe(200);
    expect(
      res.body.items.map((item: { name_en: string; sold_here: boolean }) => [
        item.name_en,
        item.sold_here,
      ]),
    ).toStrictEqual([
      ['Haircut', true],
      ['Shave', true],
      ['Hair wash', true],
      ['Kids haircut', false],
    ]);
  });

  it('the default list carries no sold_here', async () => {
    const res = await api.get(MIN, `/services?branch_id=${branches.B3}`);
    expect(res.body.items[0]).not.toHaveProperty('sold_here');
  });

  it('Scenario: Another branch’s view — Ma Hnin asks for B1 with sold=all: 200, no items', async () => {
    const res = await api.get(HNIN, `/services?branch_id=${branches.B1}&sold=all`);
    expect([res.status, res.body.items]).toStrictEqual([200, []]);
  });

  it('Scenario: Without a branch — 400 validation', async () => {
    const res = await api.get(ADMIN, '/services?sold=all');
    expect([res.status, res.body.code]).toStrictEqual([400, ErrorCode.VALIDATION]);
  });

  it('U Kyaw Zin (company scope) sees any branch with sold=all', async () => {
    const res = await api.get(ADMIN, `/services?branch_id=${branches.B1}&sold=all`);
    expect(names(res.body)).toStrictEqual(['Haircut', 'Shave', 'Hair wash']);
  });
});

describe('GET /v1/services/:id (task 3.5 · P2.SVC.03 · Recorded readings 3 and 8)', () => {
  it('Scenario: A barber reads Haircut — B3 only, options empty', async () => {
    const res = await api.get(AUNG, `/services/${services.HAIRCUT}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: services.HAIRCUT,
      name_en: 'Haircut',
      branch_ids: [branches.B3],
      unpriced_branch_ids: [],
      branches: [{ branch_id: branches.B3, sold: true, duration_minutes: 30 }],
      options: { groups: [], variants: [] },
      description_mm: null,
      image_attachment_id: null,
      image_url: null,
      archived_at: null,
    });
  });

  it('Scenario: The Admin reads Haircut — B1, B2 and B3 sold for 30 minutes', async () => {
    const res = await api.get(ADMIN, `/services/${services.HAIRCUT}`);
    expect(res.body.branches).toStrictEqual(
      [branches.B1, branches.B2, branches.B3]
        .sort()
        .map((branch_id) => ({ branch_id, sold: true, duration_minutes: 30 })),
    );
  });

  it('branches[] lists a row that is not sold, and unpriced_branch_ids names a sold branch with no price', async () => {
    const kids = await build.category({ name_mm: 'ကလေး', name_en: 'Kids', sort_order: 2 });
    const haircut = await build.service({
      category_id: kids,
      name_mm: 'ကလေးဆံပင်ညှပ်',
      sort_order: 1,
      sold_at: [{ branch_id: branches.B3, duration_minutes: 20 }],
    });
    await prisma.branch_services.create({
      data: {
        id: '0199a3f2-0000-7000-8000-00000000cc01',
        branch_id: branches.B1,
        service_id: haircut,
        duration_minutes: 25,
        status: ServiceStatus.INACTIVE,
      },
    });
    const res = await api.get(ADMIN, `/services/${haircut}`);
    expect(res.body.branch_ids).toStrictEqual([branches.B3]);
    expect(res.body.unpriced_branch_ids).toStrictEqual([branches.B3]);
    expect(res.body.branches).toStrictEqual(
      [
        { branch_id: branches.B1, sold: false, duration_minutes: 25 },
        { branch_id: branches.B3, sold: true, duration_minutes: 20 },
      ].sort((a, b) => (a.branch_id < b.branch_id ? -1 : 1)),
    );
  });

  it('Scenario: An archived service — Ko Aung gets 404, Ma Hnin gets 200 with archived_at', async () => {
    await build.archive('services', services.HAIR_WASH);
    const barber = await api.get(AUNG, `/services/${services.HAIR_WASH}`);
    expect([barber.status, barber.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
    const manager = await api.get(HNIN, `/services/${services.HAIR_WASH}`);
    expect(manager.status).toBe(200);
    expect(manager.body.archived_at).toBe('2026-10-05T10:00:00+06:30');
  });

  it('an unknown id is 404 not_found for everyone', async () => {
    for (const who of [AUNG, ADMIN] as const) {
      const res = await api.get(who, '/services/0199a3f2-0000-7000-8005-0000000000ff');
      expect([res.status, res.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
    }
  });

  it('a service of an inactive category is still readable (a read by id is not a picker)', async () => {
    await prisma.service_categories.update({
      where: { id: serviceCategories.SERVICES },
      data: { status: ServiceCategoryStatus.INACTIVE },
    });
    expect((await api.get(AUNG, `/services/${services.HAIRCUT}`)).status).toBe(200);
  });
});
