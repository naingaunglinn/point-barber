import { randomUUID } from 'node:crypto';

import { LocationType, ServiceStatus } from '@point/shared';

import type { PrismaService } from '../../src/common/database/prisma.service.js';

// add-service-catalogue — the SQL test builders of the scenario rows the specs create inside each test
// ("Kids / ကလေး", "Kids haircut / ကလေးဆံပင်ညှပ်", the extra price rows). They write through Prisma, as the
// walk-in tests do, never through the endpoints under test. `cleanup` removes what a test added.

export interface CatalogueBuilder {
  category(row: {
    name_mm: string;
    name_en?: string;
    sort_order: number;
    status?: number;
  }): Promise<string>;
  service(row: {
    category_id: string;
    name_mm: string;
    name_en?: string;
    sort_order?: number;
    status?: number;
    sold_at?: readonly { branch_id: string; duration_minutes: number }[];
  }): Promise<string>;
  /** A branch price (`from` is a Myanmar date `YYYY-MM-DD`). */
  price(row: {
    branch_id: string;
    service_id: string;
    amount: bigint;
    from: string;
  }): Promise<string>;
  /** Archives a service or a category now. */
  archive(table: 'services' | 'service_categories', id: string, at?: Date): Promise<void>;
  /** Deletes every row this builder made, prices and sale rows first (test rows only). */
  cleanup(): Promise<void>;
}

export async function catalogueBuilder(prisma: PrismaService): Promise<CatalogueBuilder> {
  const company = await prisma.companies.findFirstOrThrow();
  const services: string[] = [];
  const categories: string[] = [];
  return {
    async category(row) {
      const id = randomUUID();
      await prisma.service_categories.create({
        data: {
          id,
          company_id: company.id,
          name_mm: row.name_mm,
          name_en: row.name_en ?? null,
          sort_order: row.sort_order,
          status: row.status ?? ServiceStatus.ACTIVE,
        },
      });
      categories.push(id);
      return id;
    },
    async service(row) {
      const id = randomUUID();
      await prisma.services.create({
        data: {
          id,
          company_id: company.id,
          category_id: row.category_id,
          name_mm: row.name_mm,
          name_en: row.name_en ?? null,
          pricing_mode: 1,
          sort_order: row.sort_order ?? 0,
          status: row.status ?? ServiceStatus.ACTIVE,
        },
      });
      for (const sold of row.sold_at ?? []) {
        await prisma.branch_services.create({
          data: {
            id: randomUUID(),
            branch_id: sold.branch_id,
            service_id: id,
            duration_minutes: sold.duration_minutes,
            status: ServiceStatus.ACTIVE,
          },
        });
      }
      services.push(id);
      return id;
    },
    async price(row) {
      const id = randomUUID();
      await prisma.service_prices.create({
        data: {
          id,
          branch_id: row.branch_id,
          service_id: row.service_id,
          location_type: LocationType.BRANCH,
          price_amount: row.amount,
          effective_from: new Date(`${row.from}T00:00:00Z`),
        },
      });
      return id;
    },
    async archive(table, id, at = new Date('2026-10-05T10:00:00+06:30')) {
      if (table === 'services') {
        await prisma.services.update({ where: { id }, data: { archived_at: at } });
      } else {
        await prisma.service_categories.update({ where: { id }, data: { archived_at: at } });
      }
    },
    async cleanup() {
      await prisma.service_prices.deleteMany({ where: { service_id: { in: services } } });
      await prisma.branch_services.deleteMany({ where: { service_id: { in: services } } });
      await prisma.services.deleteMany({ where: { id: { in: services } } });
      await prisma.service_categories.deleteMany({ where: { id: { in: categories } } });
      services.length = 0;
      categories.length = 0;
    },
  };
}
