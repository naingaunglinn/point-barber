// Fixture module 070 — which barber may do which service (docs/plan/spec-fixtures.md §2 – §3 ·
// D-EMP-05 · P2-RULE-06 · add-walkin-visit-checkout design D3): every fixture barber with an active
// branch assignment — Ko Aung and Ko Min at B3, Ko Htet at B1, Ko Thura at B2 — × Haircut / Shave /
// Hair wash at their branch, from 01/Sep/2026, open-ended, no home service. Ko Naing (assignment
// ended 30/Sep/2026) gets none. Development and test data only.
import { FIXTURE_IDS, fixtureRowId } from '../../../packages/shared/src/testing/fixture-ids.ts';

export const EFFECTIVE_FROM = '2026-09-01';
export const BARBERS = [
  { code: 'E004', branch: 'B3' },
  { code: 'E005', branch: 'B3' },
  { code: 'E006', branch: 'B1' },
  { code: 'E007', branch: 'B2' },
];
export const SERVICES = ['HAIRCUT', 'SHAVE', 'HAIR_WASH'];

/** @param {{ query: (sql: string, values: unknown[]) => Promise<unknown> }} db */
export async function seed(db) {
  let row = 0;
  for (const barber of BARBERS) {
    for (const service of SERVICES) {
      row += 1;
      await db.query(
        `INSERT INTO employee_service_eligibilities
           (id, employee_id, branch_id, service_id, home_allowed, effective_from, effective_to)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, false, $5::date, NULL)
         ON CONFLICT (id) DO UPDATE SET employee_id = EXCLUDED.employee_id,
           branch_id = EXCLUDED.branch_id, service_id = EXCLUDED.service_id, home_allowed = false,
           effective_from = EXCLUDED.effective_from, effective_to = NULL, archived_at = NULL,
           updated_at = now()`,
        [
          fixtureRowId('employee_service_eligibilities', row),
          FIXTURE_IDS.employees[barber.code],
          FIXTURE_IDS.branches[barber.branch],
          FIXTURE_IDS.services[service],
          EFFECTIVE_FROM,
        ],
      );
    }
  }
}
