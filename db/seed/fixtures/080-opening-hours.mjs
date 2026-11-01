// Fixture module 080 — shop hours 9:00 AM – 9:00 PM every day at B1 – B3 (docs/plan/spec-fixtures.md
// §5 · add-walkin-visit-checkout design D3 / D10: the receipt's opening-hours line). Weekday 1 = Monday
// … 7 = Sunday; set by U Kyaw Zin. Development and test data only.
import { FIXTURE_IDS, fixtureRowId } from '../../../packages/shared/src/testing/fixture-ids.ts';

export const OPENS_AT = '09:00';
export const CLOSES_AT = '21:00';
const BRANCHES = ['B1', 'B2', 'B3'];

/** @param {{ query: (sql: string, values: unknown[]) => Promise<unknown> }} db */
export async function seed(db) {
  let row = 0;
  for (const branch of BRANCHES) {
    for (let day = 1; day <= 7; day += 1) {
      row += 1;
      await db.query(
        `INSERT INTO branch_opening_hours
           (id, branch_id, day_of_week, is_closed, opens_at, closes_at, updated_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3, false, $4::time, $5::time, $6::uuid)
         ON CONFLICT (id) DO UPDATE SET branch_id = EXCLUDED.branch_id,
           day_of_week = EXCLUDED.day_of_week, is_closed = false, opens_at = EXCLUDED.opens_at,
           closes_at = EXCLUDED.closes_at, updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = now()`,
        [
          fixtureRowId('branch_opening_hours', row),
          FIXTURE_IDS.branches[branch],
          day,
          OPENS_AT,
          CLOSES_AT,
          FIXTURE_IDS.users.E001,
        ],
      );
    }
  }
}
