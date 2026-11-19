// Fixture module 020 — the nine people E001–E009: one `users` and one `employees` row each
// (docs/plan/spec-fixtures.md §2 · add-foundation-auth-access design D16). Development and test data
// only (`pnpm db:seed`). ui_language, google_subject and show_own_earnings stay NULL.
import { EmployeeStatus, UserStatus } from '../../../packages/shared/src/constants/status.ts';
import { FIXTURE_IDS } from '../../../packages/shared/src/testing/fixture-ids.ts';

export const JOIN_DATE = '2026-09-01';
/** Ma Thida's invitation (INVITED, never signed in). */
export const THIDA_INVITED_AT = '2026-09-01T09:00:00+06:30';

const person = (code, name_en, name_mm, email, user_status, employee_status) => ({
  code,
  user_id: FIXTURE_IDS.users[code],
  employee_id: FIXTURE_IDS.employees[code],
  name_en,
  name_mm,
  email,
  user_status,
  employee_status,
});

export const PEOPLE = [
  person(
    'E001',
    'U Kyaw Zin',
    'ဦးကျော်ဇင်',
    'kyawzin@point.test',
    UserStatus.ACTIVE,
    EmployeeStatus.ACTIVE,
  ),
  person('E002', 'Ma Hnin', 'မနှင်း', 'hnin@point.test', UserStatus.ACTIVE, EmployeeStatus.ACTIVE),
  person('E003', 'Ko Zaw', 'ကိုဇော်', 'zaw@point.test', UserStatus.ACTIVE, EmployeeStatus.ACTIVE),
  person(
    'E004',
    'Ko Aung',
    'ကိုအောင်',
    'aung@point.test',
    UserStatus.ACTIVE,
    EmployeeStatus.ACTIVE,
  ),
  person('E005', 'Ko Min', 'ကိုမင်း', 'min@point.test', UserStatus.ACTIVE, EmployeeStatus.ACTIVE),
  person('E006', 'Ko Htet', 'ကိုထက်', 'htet@point.test', UserStatus.ACTIVE, EmployeeStatus.ACTIVE),
  person(
    'E007',
    'Ko Thura',
    'ကိုသူရ',
    'thura@point.test',
    UserStatus.ACTIVE,
    EmployeeStatus.ACTIVE,
  ),
  person(
    'E008',
    'Ma Thida',
    'မသီတာ',
    'thida@point.test',
    UserStatus.INVITED,
    EmployeeStatus.ACTIVE,
  ),
  person(
    'E009',
    'Ko Naing',
    'ကိုနိုင်',
    'naing@point.test',
    UserStatus.DISABLED,
    EmployeeStatus.INACTIVE,
  ),
];

/** @param {{ query: (sql: string, values: unknown[]) => Promise<unknown> }} db */
export async function seed(db, { companyId }) {
  for (const p of PEOPLE) {
    const invitedAt = p.user_status === UserStatus.INVITED ? THIDA_INVITED_AT : null;
    await db.query(
      `INSERT INTO users (id, email, status, invited_at, activated_at, ui_language, google_subject)
       VALUES ($1::uuid, $2, $3, $4::timestamptz, NULL, NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, status = EXCLUDED.status,
         invited_at = EXCLUDED.invited_at, activated_at = NULL, ui_language = NULL,
         google_subject = NULL, failed_login_count = 0, login_locked_until = NULL,
         archived_at = NULL, updated_at = now()`,
      [p.user_id, p.email, p.user_status, invitedAt],
    );
    await db.query(
      `INSERT INTO employees (id, company_id, user_id, employee_code, name_mm, name_en, status,
                              join_date, show_own_earnings)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::date, NULL)
       ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, user_id = EXCLUDED.user_id,
         employee_code = EXCLUDED.employee_code, name_mm = EXCLUDED.name_mm,
         name_en = EXCLUDED.name_en, status = EXCLUDED.status, join_date = EXCLUDED.join_date,
         show_own_earnings = NULL, archived_at = NULL, updated_at = now()`,
      [
        p.employee_id,
        companyId,
        p.user_id,
        p.code,
        p.name_mm,
        p.name_en,
        p.employee_status,
        JOIN_DATE,
      ],
    );
  }
}
