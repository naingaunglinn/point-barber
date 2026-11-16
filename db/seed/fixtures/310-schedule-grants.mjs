// Fixture module 310 — the schedule codes on the fixture Manager role (API Part 2 §12 · ADR-012 ·
// add-schedule-patterns task 1.6 · docs/plan/spec-fixtures.md §9): `schedule.view` and `schedule.update`,
// so Ma Hnin holds them for B3 and Ko Zaw for B1 (their Manager grants); the Barber role gets none. The
// base seed gives them to the Manager role it creates; a development database whose roles were created
// earlier had no such codes, and roles are never re-seeded (D-ROLE-09), so this module adds the missing
// links — and on a fresh database adds nothing. add-schedule-roster adds `schedule.create` /
// `schedule.delete` here. Development and test data only.
import { MANAGER_SCHEDULE_CODES } from '../../../packages/shared/src/permissions/seed-codes.ts';
import { fixtureRowId } from '../../../packages/shared/src/testing/fixture-ids.ts';

export const GRANTS = [{ role: 'Manager', codes: MANAGER_SCHEDULE_CODES }];

/**
 * The `role_permissions` row numbers of this module: 310 × 100 + n, a block of its own, so they never
 * meet the rows 1 … 15 of module 090 (an id taken there would make ON CONFLICT skip the link).
 */
export const FIRST_ROW = 310 * 100 + 1;

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
