import { ErrorCode } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { type CatalogueBuilder, catalogueBuilder } from './helpers/catalogue.js';
import {
  restoreCatalogue,
  snapshotCatalogue,
  type CatalogueSnapshot,
} from './helpers/catalogue-reset.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-service-catalogue task 5.7 — two connections at once (design D4 · API-IDEM-05 · CG-DB-12): a category
// archive and a service create into it, and two creates with one name. Monday 05/Oct/2026 10:00 AM MMT.
const { serviceCategories } = FIXTURE_IDS;
const NOW = '2026-10-05T10:00:00+06:30';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let t: SeededApp;
let build: CatalogueBuilder;
let snapshot: CatalogueSnapshot;
let cookie = '';

beforeAll(async () => {
  t = await startSeededApp({ now: new Date(NOW) });
  build = await catalogueBuilder(t.prisma);
  snapshot = await snapshotCatalogue(t.prisma);
  cookie = (await t.signIn('E001')).cookie;
});
afterAll(() => t.close());
afterEach(async () => {
  await restoreCatalogue(t.prisma, snapshot);
  await build.cleanup();
});

const createService = (category_id: string, name_mm: string) =>
  t.http
    .post('/api/v1/services')
    .set('Cookie', cookie)
    .send({ category_id, name_mm, name_en: 'Kids haircut', pricing_mode: 1 });

describe('Two connections at once (task 5.7 · design D4 · API-IDEM-05)', () => {
  it('Scenario: A category archive and a service create into it — the create waits, then answers 422 category_inactive', async () => {
    const kids = await build.category({ name_mm: 'ကလေး', name_en: 'Kids', sort_order: 2 });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The archive of P2.CAT.04, held open: the category is locked and archived, the commit is still to come.
    const archiving = t.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM service_categories WHERE id = ${kids}::uuid FOR UPDATE`;
      await tx.service_categories.update({
        where: { id: kids },
        data: { archived_at: new Date(NOW) },
      });
      await gate;
    });
    await pause(300);
    let settled = false;
    const creating = createService(kids, 'ကလေးဆံပင်ညှပ်').then((res) => {
      settled = true;
      return res;
    });
    await pause(700);
    expect(settled).toBe(false);
    release();
    await archiving;
    const res = await creating;
    expect([res.status, res.body.code]).toStrictEqual([422, ErrorCode.CATEGORY_INACTIVE]);
    expect(await t.prisma.services.count({ where: { category_id: kids } })).toBe(0);
  });

  it('Scenario: Two creates with one name — one 201, one 409 already_exists', async () => {
    const results = await Promise.all([
      createService(serviceCategories.SERVICES, 'ကလေးဆံပင်ညှပ်'),
      createService(serviceCategories.SERVICES, 'ကလေးဆံပင်ညှပ်'),
    ]);
    expect(results.map((res) => res.status).sort()).toStrictEqual([201, 409]);
    expect(results.find((res) => res.status === 409)?.body.code).toBe(ErrorCode.ALREADY_EXISTS);
    expect(await t.prisma.services.count({ where: { name_mm: 'ကလေးဆံပင်ညှပ်' } })).toBe(1);
  });
});
