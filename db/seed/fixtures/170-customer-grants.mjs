// Fixture module 170 — the Part 3 customer codes on the fixture Manager and Barber roles (API Part 3 §7 ·
// ADR-012 · add-customer-management task 1.3 · docs/plan/spec-fixtures.md §9): Manager customer.view /
// create / update, Barber customer.view / create. The base seed gives them to the seed roles it
// creates; a development database whose roles were created before Part 3 had no such codes, and roles
// are never re-seeded (D-ROLE-09), so this module adds the missing links — and on a fresh database adds
// nothing. Development and test data only.
import {
  BARBER_PART3_CUSTOMER_CODES,
  MANAGER_PART3_CUSTOMER_CODES,
} from '../../../packages/shared/src/permissions/seed-codes.ts';
import { fixtureRowId } from '../../../packages/shared/src/testing/fixture-ids.ts';

export const GRANTS = [
  { role: 'Manager', codes: MANAGER_PART3_CUSTOMER_CODES },
  { role: 'Barber', codes: BARBER_PART3_CUSTOMER_CODES },
];

/**
 * The `role_permissions` row numbers of this module: 170 × 100 + n, a block of its own, so they never
 * meet the rows of module 090 (1 … 15) or another module's block (an id taken there would make
 * ON CONFLICT skip the link).
 */
export const FIRST_ROW = 170 * 100 + 1;

/**
 * @param {{
 *   query: (sql: string, values: unknown[]) => Promise<unknown>,
 *   rows: (sql: string, values: unknown[]) => Promise<Record<string, unknown>[]>,
 * }} db
 */
export async function seed(db, { companyId }) {
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
