import { ServiceStatus, servicesQuerySchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { ServiceCatalog } from '../src/modules/catalog/index.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-walkin-visit-checkout task 4.4 (service part) — services-pricing spec "The POS lists only the
// services sold at its branch" (P2.SVC.01 · P2.CAT.01 · P2-RULE-01 · API-PERM-03) on the fixture
// catalogue: Haircut, Shave, Hair wash sold at B1 – B3. The endpoints are wired with the guards.
const { branches, services, serviceCategories } = FIXTURE_IDS;

let s: SeededApp;
let prisma: PrismaService;
let catalog: ServiceCatalog;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:00:00+06:30'));
  prisma = s.app.get(PrismaService);
  catalog = s.app.get(ServiceCatalog);
});
afterAll(() => s.close());

const list = (query: Record<string, unknown>, scope: 'all' | string[] = 'all') =>
  catalog.listServices(prisma, servicesQuerySchema.parse(query), scope);

describe('ServiceCatalog.listServices (P2.SVC.01)', () => {
  it('Scenario: Services sold at B3 — Haircut, Shave, Hair wash in catalogue order', async () => {
    const page = await list({ branch_id: branches.B3 });
    expect(page.items.map((item) => item.name_en)).toStrictEqual(['Haircut', 'Shave', 'Hair wash']);
    expect(page.items[0]).toMatchObject({
      id: services.HAIRCUT,
      category_id: serviceCategories.SERVICES,
      pricing_mode: 1,
      status: ServiceStatus.ACTIVE,
      branch_ids: [branches.B1, branches.B2, branches.B3].sort(),
      unpriced_branch_ids: [],
      duration_range: { min: 30, max: 30 },
    });
    expect(page.next_cursor).toBeNull();
  });

  it('Scenario: A service switched off at the branch — hidden at B3, still at B1', async () => {
    await prisma.branch_services.updateMany({
      where: { branch_id: branches.B3, service_id: services.HAIR_WASH },
      data: { status: ServiceStatus.INACTIVE },
    });
    expect((await list({ branch_id: branches.B3 })).items.map((i) => i.name_en)).toStrictEqual([
      'Haircut',
      'Shave',
    ]);
    expect((await list({ branch_id: branches.B1 })).items.map((i) => i.name_en)).toContain(
      'Hair wash',
    );
    await prisma.branch_services.updateMany({
      where: { branch_id: branches.B3, service_id: services.HAIR_WASH },
      data: { status: ServiceStatus.ACTIVE },
    });
  });

  it('Scenario: Branch outside the read scope — 200 with items = []', async () => {
    expect(await list({ branch_id: branches.B3 }, [branches.B1])).toStrictEqual({
      items: [],
      next_cursor: null,
      total: null,
    });
  });

  it('filters by pricing mode, category and name (Myanmar or English)', async () => {
    expect((await list({ branch_id: branches.B3, pricing_mode: '1' })).items).toHaveLength(3);
    expect((await list({ branch_id: branches.B3, pricing_mode: '2' })).items).toHaveLength(0);
    expect(
      (await list({ category_id: serviceCategories.SERVICES, q: 'shav' })).items.map((i) => i.id),
    ).toStrictEqual([services.SHAVE]);
    // `%` and `_` are text, not ILIKE wildcards.
    expect((await list({ branch_id: branches.B3, q: '%' })).items).toStrictEqual([]);
    expect((await list({ branch_id: branches.B3, q: 'Hair_wash' })).items).toStrictEqual([]);
  });

  it('pages with an opaque cursor', async () => {
    const first = await list({ branch_id: branches.B3, limit: '2' });
    expect(first.items.map((i) => i.name_en)).toStrictEqual(['Haircut', 'Shave']);
    expect(first.next_cursor).not.toBeNull();
    const second = await list({ branch_id: branches.B3, limit: '2', cursor: first.next_cursor });
    expect(second.items.map((i) => i.name_en)).toStrictEqual(['Hair wash']);
    expect(second.next_cursor).toBeNull();
  });

  it('a branch where the service is sold but has no price today is unpriced', async () => {
    await prisma.service_prices.updateMany({
      where: { branch_id: branches.B2, service_id: services.SHAVE, employee_id: null },
      data: { effective_to: new Date('2026-10-04T00:00:00Z') },
    });
    const shave = (await list({ q: 'Shave' })).items[0];
    expect(shave?.unpriced_branch_ids).toStrictEqual([branches.B2]);
  });
});

describe('ServiceCatalog.listCategories (P2.CAT.01)', () => {
  it('the ACTIVE categories in sort order', async () => {
    const { items } = await catalog.listCategories(prisma);
    expect(items.map((item) => [item.id, item.status])).toStrictEqual([
      [serviceCategories.SERVICES, ServiceStatus.ACTIVE],
    ]);
  });
});
