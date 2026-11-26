import { FIXTURE_IDS } from '@point/shared/testing';

import type { PrismaService } from '../../src/common/database/prisma.service.js';

// add-service-catalogue — puts the fixture catalogue back after a test that changed it through the endpoints:
// the three services (name, category, position, status, buffer, website fields, archive), their price rows
// (closed or archived by a test) and the category. Rows a test added are removed by the builder's `cleanup`
// and by `removeAdded`.

const { services, serviceCategories } = FIXTURE_IDS;
const FIXTURE_SERVICES = [services.HAIRCUT, services.SHAVE, services.HAIR_WASH];

export interface CatalogueSnapshot {
  readonly services: { id: string; name_mm: string; name_en: string | null; sort_order: number }[];
  readonly priceIds: string[];
  readonly category: { name_mm: string; name_en: string | null };
}

export async function snapshotCatalogue(prisma: PrismaService): Promise<CatalogueSnapshot> {
  const rows = await prisma.services.findMany({
    where: { id: { in: FIXTURE_SERVICES } },
    select: { id: true, name_mm: true, name_en: true, sort_order: true },
  });
  const prices = await prisma.service_prices.findMany({
    where: { service_id: { in: FIXTURE_SERVICES } },
    select: { id: true },
  });
  const category = await prisma.service_categories.findUniqueOrThrow({
    where: { id: serviceCategories.SERVICES },
    select: { name_mm: true, name_en: true },
  });
  return { services: rows, priceIds: prices.map((row) => row.id), category };
}

export async function restoreCatalogue(
  prisma: PrismaService,
  snapshot: CatalogueSnapshot,
): Promise<void> {
  // Rows the endpoints created (and their sale rows) go first; the builder removed what it made.
  const added = await prisma.services.findMany({
    where: { id: { notIn: FIXTURE_SERVICES } },
    select: { id: true },
  });
  const addedIds = added.map((row) => row.id);
  await prisma.service_prices.deleteMany({
    where: { OR: [{ service_id: { in: addedIds } }, { id: { notIn: snapshot.priceIds } }] },
  });
  await prisma.branch_services.deleteMany({ where: { service_id: { in: addedIds } } });
  await prisma.services.deleteMany({ where: { id: { in: addedIds } } });
  await prisma.service_prices.updateMany({
    where: { id: { in: snapshot.priceIds } },
    data: { effective_to: null, archived_at: null },
  });
  for (const row of snapshot.services) {
    await prisma.services.update({
      where: { id: row.id },
      data: {
        category_id: serviceCategories.SERVICES,
        name_mm: row.name_mm,
        name_en: row.name_en,
        description_mm: null,
        description_en: null,
        public_description_mm: null,
        public_description_en: null,
        sort_order: row.sort_order,
        buffer_minutes: 0,
        show_on_website: true,
        status: 1,
        archived_at: null,
        updated_at: new Date('2026-10-05T09:00:00+06:30'),
      },
    });
  }
}
