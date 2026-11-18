// Fixture module 150 — the three development leave types of docs/plan/spec-fixtures.md §10.3
// (add-leave-types task 1.7 · design D3 · D-LV-01 · DB Part 2 `leave_types`): Paid leave (paid, 1),
// Sick leave (unpaid, 2) and Unpaid leave (unpaid, 3), invented from the words of D-LV-01 — not the
// shop's Fresha list, which the admin types in before go-live (Recorded reading 1). Training is made by
// the tests, never seeded. Development and test data only (`pnpm db:seed` refuses production).
import { FIXTURE_IDS } from '../../../packages/shared/src/testing/fixture-ids.ts';

/** leave_types.status 1 ACTIVE (DB Part 2 v1.3 — `leave_types_status_chk`). */
const ACTIVE = 1;

/** §10.3 in its order: the position is the stored `sort_order`. */
export const LEAVE_TYPES = [
  { key: 'PAID_LEAVE', name_en: 'Paid leave', name_mm: 'လစာရခွင့်', is_paid: true },
  { key: 'SICK_LEAVE', name_en: 'Sick leave', name_mm: 'ဆေးခွင့်', is_paid: false },
  { key: 'UNPAID_LEAVE', name_en: 'Unpaid leave', name_mm: 'လစာမဲ့ခွင့်', is_paid: false },
];

/** @param {{ query: (sql: string, values: unknown[]) => Promise<unknown> }} db */
export async function seed(db, { companyId }) {
  for (const [index, type] of LEAVE_TYPES.entries()) {
    await db.query(
      `INSERT INTO leave_types (id, company_id, name_mm, name_en, is_paid, sort_order, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, name_mm = EXCLUDED.name_mm,
         name_en = EXCLUDED.name_en, is_paid = EXCLUDED.is_paid, sort_order = EXCLUDED.sort_order,
         status = EXCLUDED.status, archived_at = NULL, updated_at = now()`,
      [
        FIXTURE_IDS.leaveTypes[type.key],
        companyId,
        type.name_mm,
        type.name_en,
        type.is_paid,
        index + 1,
        ACTIVE,
      ],
    );
  }
}
