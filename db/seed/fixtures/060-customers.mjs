// Fixture module 060 — the customer Ma Su (docs/plan/spec-fixtures.md §2 · D-CUS-02 ·
// add-walkin-visit-checkout design D3): typed `09 7712 3456`, stored E.164 `+95977123456`, returning
// customer at B3. Ko Phyo stays out: he is the first-visit customer the scenarios create. Development
// and test data only.
import { FIXTURE_IDS } from '../../../packages/shared/src/testing/fixture-ids.ts';

export const CUSTOMERS = [
  { id: FIXTURE_IDS.customers.MA_SU, name: 'Ma Su', phone: '09 7712 3456', e164: '+95977123456' },
];

/** @param {{ query: (sql: string, values: unknown[]) => Promise<unknown> }} db */
export async function seed(db, { companyId }) {
  for (const c of CUSTOMERS) {
    await db.query(
      `INSERT INTO customers (id, company_id, name, phone, phone_normalized, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 1)
       ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, name = EXCLUDED.name,
         phone = EXCLUDED.phone, phone_normalized = EXCLUDED.phone_normalized, status = 1,
         archived_at = NULL, updated_at = now()`,
      [c.id, companyId, c.name, c.phone, c.e164],
    );
  }
}
