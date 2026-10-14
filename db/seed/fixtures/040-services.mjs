// Fixture module 040 — one category, three services and their prices (docs/plan/spec-fixtures.md §3
// · add-foundation-auth-access design D16): Haircut / Shave / Hair wash (SIMPLE pricing) at B1–B3,
// prices from 01/Sep/2026 at the branch, and Ko Aung's own Haircut price at B3. Hair colour waits for
// the option-pricing change. Whole MMK. Development and test data only (`pnpm db:seed`).
import { FIXTURE_IDS, fixtureRowId } from '../../../packages/shared/src/testing/fixture-ids.ts';

export const CATEGORY = {
  id: FIXTURE_IDS.serviceCategories.SERVICES,
  name_en: 'Services',
  name_mm: 'ဝန်ဆောင်မှု',
};
/** services.pricing_mode 1 SIMPLE; service_prices.location_type 1 BRANCH (DB Part 2 v1.3). */
const SIMPLE = 1;
const AT_BRANCH = 1;
export const EFFECTIVE_FROM = '2026-09-01';

export const SERVICES = [
  {
    key: 'HAIRCUT',
    name_en: 'Haircut',
    name_mm: 'ဆံပင်ညှပ်',
    minutes: 30,
    prices: { B1: 6000, B2: 7000, B3: 8000 },
  },
  {
    key: 'SHAVE',
    name_en: 'Shave',
    name_mm: 'မုတ်ဆိတ်ရိတ်',
    minutes: 15,
    prices: { B1: 3000, B2: 3000, B3: 3000 },
  },
  {
    key: 'HAIR_WASH',
    name_en: 'Hair wash',
    name_mm: 'ခေါင်းလျှော်',
    minutes: 10,
    prices: { B1: 2000, B2: 2000, B3: 2000 },
  },
];

/** Ko Aung's own price for Haircut at B3 (fixtures §3). */
export const BARBER_PRICES = [
  { employee: 'E004', service: 'HAIRCUT', branch: 'B3', amount: 10000 },
];

/** @param {{ query: (sql: string, values: unknown[]) => Promise<unknown> }} db */
export async function seed(db, { companyId }) {
  await db.query(
    `INSERT INTO service_categories (id, company_id, name_mm, name_en, sort_order, status)
     VALUES ($1::uuid, $2::uuid, $3, $4, 1, 1)
     ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, name_mm = EXCLUDED.name_mm,
       name_en = EXCLUDED.name_en, status = 1, archived_at = NULL, updated_at = now()`,
    [CATEGORY.id, companyId, CATEGORY.name_mm, CATEGORY.name_en],
  );
  let branchServiceRow = 0;
  let priceRow = 0;
  for (const [order, s] of SERVICES.entries()) {
    const serviceId = FIXTURE_IDS.services[s.key];
    await db.query(
      `INSERT INTO services (id, company_id, category_id, name_mm, name_en, pricing_mode, sort_order, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, 1)
       ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id,
         category_id = EXCLUDED.category_id, name_mm = EXCLUDED.name_mm, name_en = EXCLUDED.name_en,
         pricing_mode = EXCLUDED.pricing_mode, sort_order = EXCLUDED.sort_order, status = 1,
         archived_at = NULL, updated_at = now()`,
      [serviceId, companyId, CATEGORY.id, s.name_mm, s.name_en, SIMPLE, order + 1],
    );
    for (const [branch, amount] of Object.entries(s.prices)) {
      branchServiceRow += 1;
      await db.query(
        `INSERT INTO branch_services (id, branch_id, service_id, duration_minutes, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 1)
         ON CONFLICT (id) DO UPDATE SET branch_id = EXCLUDED.branch_id,
           service_id = EXCLUDED.service_id, duration_minutes = EXCLUDED.duration_minutes,
           status = 1, updated_at = now()`,
        [
          fixtureRowId('branch_services', branchServiceRow),
          FIXTURE_IDS.branches[branch],
          serviceId,
          s.minutes,
        ],
      );
      priceRow += 1;
      await price(db, priceRow, FIXTURE_IDS.branches[branch], serviceId, null, amount);
    }
  }
  for (const p of BARBER_PRICES) {
    priceRow += 1;
    await price(
      db,
      priceRow,
      FIXTURE_IDS.branches[p.branch],
      FIXTURE_IDS.services[p.service],
      FIXTURE_IDS.employees[p.employee],
      p.amount,
    );
  }
}

async function price(db, row, branchId, serviceId, employeeId, amount) {
  await db.query(
    `INSERT INTO service_prices (id, branch_id, service_id, location_type, employee_id, price_amount,
                                 effective_from)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7::date)
     ON CONFLICT (id) DO UPDATE SET branch_id = EXCLUDED.branch_id,
       service_id = EXCLUDED.service_id, location_type = EXCLUDED.location_type,
       employee_id = EXCLUDED.employee_id, price_amount = EXCLUDED.price_amount,
       effective_from = EXCLUDED.effective_from, effective_to = NULL, archived_at = NULL,
       updated_at = now()`,
    [
      fixtureRowId('service_prices', row),
      branchId,
      serviceId,
      AT_BRANCH,
      employeeId,
      amount,
      EFFECTIVE_FROM,
    ],
  );
}
