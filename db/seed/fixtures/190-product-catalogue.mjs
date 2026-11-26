// Fixture module 190 — the scenario rows of add-product-catalogue design D3 (docs/plan/spec-fixtures.md
// · API Part 6 · DB Part 6): three product categories, three products, one supplier and three stock
// adjustment reasons, plus the two Manager codes `product.view` and `supplier.view` on a Manager role
// created before Part 6 (roles are never re-seeded — D-ROLE-09). The reasons are examples of DB Part 6
// and P6-RULE-07, fixture only: the real list is the owner's go-live list (P6-RULE-16), and no base seed
// writes a reason (PC8). Development and test data only (`pnpm db:seed` refuses production).
import { MANAGER_PART6_CATALOGUE_CODES } from '../../../packages/shared/src/permissions/seed-codes.ts';
import { FIXTURE_IDS, fixtureRowId } from '../../../packages/shared/src/testing/fixture-ids.ts';

/** `status` 1 ACTIVE on all four tables (`*_status_chk`). */
const ACTIVE = 1;

/** The categories in their order: the position is the stored `sort_order`. */
export const CATEGORIES = [
  { key: 'STYLING', name_mm: 'ဆံပင်ပုံသွင်း', name_en: 'Styling' },
  { key: 'HAIR_COLOUR', name_mm: 'ဆံပင်ဆေး', name_en: 'Hair colour' },
  { key: 'HAIR_CARE', name_mm: 'ဆံပင်ထိန်း', name_en: 'Hair care' },
];

/** Pomade is sold at 12,000 (threshold 3); the other two are shop use (no price, threshold 2). */
export const PRODUCTS = [
  {
    key: 'POMADE',
    category: 'STYLING',
    name_mm: 'ပိုမိတ်',
    name_en: 'Pomade',
    sku: 'PMD-001',
    is_sellable: true,
    sell_price_amount: 12000,
    threshold: 3,
  },
  {
    key: 'HAIR_COLOUR_BLACK',
    category: 'HAIR_COLOUR',
    name_mm: 'ဆံပင်ဆေး အနက်',
    name_en: 'Hair colour black',
    sku: 'HC-BLK',
    is_sellable: false,
    sell_price_amount: null,
    threshold: 2,
  },
  {
    key: 'SHAMPOO',
    category: 'HAIR_CARE',
    name_mm: 'ခေါင်းလျှော်ရည်',
    name_en: 'Shampoo',
    sku: null,
    is_sellable: false,
    sell_price_amount: null,
    threshold: 2,
  },
];

export const SUPPLIERS = [
  {
    key: 'SHWE_HLA',
    name: 'Shwe Hla Trading',
    phone: '09 450 000 222',
    address: 'No. 5, Supply Road, Yangon',
  },
];

export const REASONS = [
  { key: 'DAMAGED', name_mm: 'ပျက်စီး', name_en: 'Damaged' },
  { key: 'LOST', name_mm: 'ပျောက်', name_en: 'Lost' },
  { key: 'ENTRY_ERROR', name_mm: 'ရိုက်မှား', name_en: 'Entry error' },
];

export const GRANTS = [{ role: 'Manager', codes: MANAGER_PART6_CATALOGUE_CODES }];

/**
 * The `role_permissions` row numbers of this module: 190 × 100 + n, a block of its own (as modules 100
 * and 310), so they never meet the rows of another module (an id taken there would make ON CONFLICT skip
 * the link).
 */
export const FIRST_ROW = 190 * 100 + 1;

/**
 * @param {{
 *   query: (sql: string, values: unknown[]) => Promise<unknown>,
 *   rows: (sql: string, values: unknown[]) => Promise<Record<string, unknown>[]>,
 * }} db
 */
export async function seed(db, { companyId }) {
  for (const [index, category] of CATEGORIES.entries()) {
    await db.query(
      `INSERT INTO product_categories (id, company_id, name_mm, name_en, sort_order, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        FIXTURE_IDS.productCategories[category.key],
        companyId,
        category.name_mm,
        category.name_en,
        index + 1,
        ACTIVE,
      ],
    );
  }
  for (const product of PRODUCTS) {
    await db.query(
      `INSERT INTO products (id, company_id, category_id, name_mm, name_en, sku, is_sellable,
         sell_price_amount, default_low_stock_threshold, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        FIXTURE_IDS.products[product.key],
        companyId,
        FIXTURE_IDS.productCategories[product.category],
        product.name_mm,
        product.name_en,
        product.sku,
        product.is_sellable,
        product.sell_price_amount,
        product.threshold,
        ACTIVE,
      ],
    );
  }
  for (const supplier of SUPPLIERS) {
    await db.query(
      `INSERT INTO suppliers (id, company_id, name, phone, address, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        FIXTURE_IDS.suppliers[supplier.key],
        companyId,
        supplier.name,
        supplier.phone,
        supplier.address,
        ACTIVE,
      ],
    );
  }
  for (const [index, reason] of REASONS.entries()) {
    await db.query(
      `INSERT INTO stock_adjustment_reasons (id, company_id, name_mm, name_en, sort_order, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        FIXTURE_IDS.stockAdjustmentReasons[reason.key],
        companyId,
        reason.name_mm,
        reason.name_en,
        index + 1,
        ACTIVE,
      ],
    );
  }
  let row = FIRST_ROW;
  for (const grant of GRANTS) {
    for (const code of grant.codes) {
      await db.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT $1::uuid, r.id, p.id
         FROM roles r, permissions p
         WHERE r.company_id = $2::uuid AND r.name_en = $3 AND r.archived_at IS NULL
           AND p.code = $4 AND p.archived_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id)
         ON CONFLICT (id) DO NOTHING`,
        [fixtureRowId('role_permissions', row), companyId, grant.role, code],
      );
      row += 1;
    }
  }
}
