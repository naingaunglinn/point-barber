// Fixture module 010 — the company and the three branches (docs/plan/spec-fixtures.md §1 ·
// add-foundation-auth-access design D16). Development and test data only (`pnpm db:seed`).
import { BranchStatus } from '../../../packages/shared/src/constants/status.ts';
import { FIXTURE_IDS } from '../../../packages/shared/src/testing/fixture-ids.ts';

export const COMPANY = { name_en: 'Point Barbershop', name_mm: 'ပွိုင့် ဘာဘာရှော့' };

export const BRANCHES = [
  { code: 'B1', id: FIXTURE_IDS.branches.B1, name_en: 'Point 1.0', name_mm: 'ပွိုင့် ၁.၀' },
  { code: 'B2', id: FIXTURE_IDS.branches.B2, name_en: 'Point 2.0', name_mm: 'ပွိုင့် ၂.၀' },
  { code: 'B3', id: FIXTURE_IDS.branches.B3, name_en: 'Point 3.0', name_mm: 'ပွိုင့် ၃.၀' },
];

/** @param {{ query: (sql: string, values: unknown[]) => Promise<unknown> }} db */
export async function seed(db, { companyId }) {
  await db.query(
    'UPDATE companies SET name_mm = $1, name_en = $2, updated_at = now() WHERE id = $3::uuid',
    [COMPANY.name_mm, COMPANY.name_en, companyId],
  );
  for (const branch of BRANCHES) {
    await db.query(
      `INSERT INTO branches (id, company_id, code, name_mm, name_en, status, is_public)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, true)
       ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, code = EXCLUDED.code,
         name_mm = EXCLUDED.name_mm, name_en = EXCLUDED.name_en, status = EXCLUDED.status,
         is_public = true, archived_at = NULL, updated_at = now()`,
      [branch.id, companyId, branch.code, branch.name_mm, branch.name_en, BranchStatus.ACTIVE],
    );
  }
}
