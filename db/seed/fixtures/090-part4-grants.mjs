// Fixture module 090 — the Part 4 seed codes on the fixture Manager and Barber roles (API Part 4 §9 ·
// ADR-012 · add-walkin-visit-checkout design D3). The base seed gives them to the seed roles it creates;
// a development database whose roles were created before Part 4 had no such codes, and roles are never
// re-seeded (D-ROLE-09), so this module adds the missing links — and on a fresh database adds nothing.
// Development and test data only.
import {
  BARBER_PART4_CODES,
  MANAGER_PART4_CODES,
} from '../../../packages/shared/src/permissions/seed-codes.ts';
import { fixtureRowId } from '../../../packages/shared/src/testing/fixture-ids.ts';

const GRANTS = [
  { role: 'Manager', codes: MANAGER_PART4_CODES },
  { role: 'Barber', codes: BARBER_PART4_CODES },
];

/**
 * @param {{
 *   query: (sql: string, values: unknown[]) => Promise<unknown>,
 *   rows: (sql: string, values: unknown[]) => Promise<Record<string, unknown>[]>,
 * }} db
 */
export async function seed(db, { companyId }) {
  let row = 0;
  for (const grant of GRANTS) {
    for (const code of grant.codes) {
      row += 1;
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
    }
  }
}
