// Fixture module 030 — branch and role assignments (docs/plan/spec-fixtures.md §2 ·
// add-foundation-auth-access design D16): from 01/Sep/2026; U Kyaw Zin is Admin at company scope,
// the others hold their seed role for their branch; Ma Thida has no role; Ko Naing's B3 assignment
// ended 30/Sep/2026 and his Barber assignment is left active, as P1.EMP.05 leaves it. Development and
// test data only (`pnpm db:seed`). Needs the seed roles of the base seed.
import { ScopeType } from '../../../packages/shared/src/constants/status.ts';
import { FIXTURE_IDS, fixtureRowId } from '../../../packages/shared/src/testing/fixture-ids.ts';

export const EFFECTIVE_FROM = '2026-09-01';
export const ASSIGNED_AT = '2026-09-01T00:00:00+06:30';

export const ASSIGNMENTS = [
  { code: 'E001', branches: ['B1', 'B2', 'B3'], role: 'Admin', scope: ScopeType.COMPANY },
  { code: 'E002', branches: ['B3'], role: 'Manager', scope: ScopeType.BRANCHES },
  { code: 'E003', branches: ['B1'], role: 'Manager', scope: ScopeType.BRANCHES },
  { code: 'E004', branches: ['B3'], role: 'Barber', scope: ScopeType.BRANCHES },
  { code: 'E005', branches: ['B3'], role: 'Barber', scope: ScopeType.BRANCHES },
  { code: 'E006', branches: ['B1'], role: 'Barber', scope: ScopeType.BRANCHES },
  { code: 'E007', branches: ['B2'], role: 'Barber', scope: ScopeType.BRANCHES },
  { code: 'E008', branches: ['B3'], role: null, scope: null },
  {
    code: 'E009',
    branches: ['B3'],
    endedOn: '2026-09-30',
    role: 'Barber',
    scope: ScopeType.BRANCHES,
  },
];

/**
 * @param {{
 *   query: (sql: string, values: unknown[]) => Promise<unknown>,
 *   rows: (sql: string, values: unknown[]) => Promise<Record<string, unknown>[]>,
 * }} db
 */
export async function seed(db, { companyId }) {
  const roles = Object.fromEntries(
    (
      await db.rows(
        'SELECT id, name_en FROM roles WHERE company_id = $1::uuid AND archived_at IS NULL',
        [companyId],
      )
    ).map((row) => [row.name_en, row.id]),
  );
  let branchRow = 0;
  let roleRow = 0;
  let roleBranchRow = 0;
  for (const a of ASSIGNMENTS) {
    const employeeId = FIXTURE_IDS.employees[a.code];
    for (const code of a.branches) {
      branchRow += 1;
      await db.query(
        `INSERT INTO employee_branches (id, employee_id, branch_id, effective_from, effective_to)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::date)
         ON CONFLICT (id) DO UPDATE SET employee_id = EXCLUDED.employee_id,
           branch_id = EXCLUDED.branch_id, effective_from = EXCLUDED.effective_from,
           effective_to = EXCLUDED.effective_to, updated_at = now()`,
        [
          fixtureRowId('employee_branches', branchRow),
          employeeId,
          FIXTURE_IDS.branches[code],
          EFFECTIVE_FROM,
          a.endedOn ?? null,
        ],
      );
    }
    if (a.role === null) continue;
    const roleId = roles[a.role];
    if (roleId === undefined) throw new Error(`030-access: seed role ${a.role} is missing`);
    roleRow += 1;
    const assignmentId = fixtureRowId('employee_roles', roleRow);
    await db.query(
      `INSERT INTO employee_roles (id, employee_id, role_id, scope_type, assigned_at, revoked_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::timestamptz, NULL)
       ON CONFLICT (id) DO UPDATE SET employee_id = EXCLUDED.employee_id,
         role_id = EXCLUDED.role_id, scope_type = EXCLUDED.scope_type,
         assigned_at = EXCLUDED.assigned_at, revoked_at = NULL, updated_at = now()`,
      [assignmentId, employeeId, roleId, a.scope, ASSIGNED_AT],
    );
    if (a.scope !== ScopeType.BRANCHES) continue;
    for (const code of a.branches) {
      roleBranchRow += 1;
      await db.query(
        `INSERT INTO employee_role_branches (id, employee_role_id, branch_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid)
         ON CONFLICT (id) DO UPDATE SET employee_role_id = EXCLUDED.employee_role_id,
           branch_id = EXCLUDED.branch_id`,
        [
          fixtureRowId('employee_role_branches', roleBranchRow),
          assignmentId,
          FIXTURE_IDS.branches[code],
        ],
      );
    }
  }
}
