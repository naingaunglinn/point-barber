// Fixture module 050 — the fixture KBZPay reference pattern (docs/plan/spec-fixtures.md §4 · D-PAY-02 ·
// add-walkin-visit-checkout design D3): `^KBZ[0-9]{10}$` on the KBZPAY method of the base seed, so
// `KBZ123` is refused and `KBZ0001234567` accepted. The row is the base seed's (no fixture id); the
// real pattern is the owner's, written by add-pilot-data-seed. Development and test data only.
export const KBZPAY_PATTERN = '^KBZ[0-9]{10}$';

/** @param {{ query: (sql: string, values: unknown[]) => Promise<unknown> }} db */
export async function seed(db, { companyId }) {
  await db.query(
    `UPDATE payment_methods SET reference_regex = $2, updated_at = now()
     WHERE company_id = $1::uuid AND code = 'KBZPAY' AND reference_regex IS DISTINCT FROM $2`,
    [companyId, KBZPAY_PATTERN],
  );
}
