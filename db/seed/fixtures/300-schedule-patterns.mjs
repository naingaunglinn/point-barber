// Fixture module 300 — the weekly patterns of docs/plan/spec-fixtures.md §10.1 (add-schedule-patterns
// task 1.6 · D-SCH-01 · D-SCH-02 · DB Part 2 `schedule_patterns`): one row per segment of a weekday
// (1 = Monday … 7 = Sunday, Myanmar time), every set from 01/Sep/2026 and open-ended. A weekday without a
// row is a day off; Ma Thida and Ko Naing have no pattern. No shift is seeded — the generator of the
// change writes them (P2-RULE-07). Development and test data only.
import { FIXTURE_IDS, fixtureRowId } from '../../../packages/shared/src/testing/fixture-ids.ts';

export const EFFECTIVE_FROM = '2026-09-01';

const MON_SAT = [1, 2, 3, 4, 5, 6];
const MON_FRI = [1, 2, 3, 4, 5];

/** §10.1 in its order: Ko Aung, Ko Min, Ma Hnin, U Kyaw Zin, Ko Htet, Ko Thura. */
export const PATTERNS = [
  { code: 'E004', days: MON_SAT, segments: [{ branch: 'B3', start: '09:00', end: '21:00' }] },
  { code: 'E005', days: MON_SAT, segments: [{ branch: 'B3', start: '10:00', end: '20:00' }] },
  { code: 'E002', days: MON_FRI, segments: [{ branch: 'B3', start: '09:00', end: '18:00' }] },
  {
    code: 'E001',
    days: [1],
    // B1 until 1:00 PM, B3 from 2:00 PM — the 60-minute gap of D-SCH-02.
    segments: [
      { branch: 'B1', start: '09:00', end: '13:00' },
      { branch: 'B3', start: '14:00', end: '18:00' },
    ],
  },
  { code: 'E006', days: MON_SAT, segments: [{ branch: 'B1', start: '09:00', end: '21:00' }] },
  { code: 'E007', days: MON_SAT, segments: [{ branch: 'B2', start: '09:00', end: '21:00' }] },
];

/** One row per (employee, weekday, segment), numbered in that order from 1. */
export const PATTERN_ROWS = PATTERNS.flatMap((pattern) =>
  pattern.days.flatMap((day) =>
    pattern.segments.map((segment) => ({ code: pattern.code, day, ...segment })),
  ),
);

/** @param {{ query: (sql: string, values: unknown[]) => Promise<unknown> }} db */
export async function seed(db) {
  for (const [index, row] of PATTERN_ROWS.entries()) {
    await db.query(
      `INSERT INTO schedule_patterns
         (id, employee_id, branch_id, day_of_week, start_time, end_time, effective_from, effective_to)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::time, $6::time, $7::date, NULL)
       ON CONFLICT (id) DO UPDATE SET employee_id = EXCLUDED.employee_id,
         branch_id = EXCLUDED.branch_id, day_of_week = EXCLUDED.day_of_week,
         start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
         effective_from = EXCLUDED.effective_from, effective_to = NULL, archived_at = NULL,
         updated_at = now()`,
      [
        fixtureRowId('schedule_patterns', index + 1),
        FIXTURE_IDS.employees[row.code],
        FIXTURE_IDS.branches[row.branch],
        row.day,
        row.start,
        row.end,
        EFFECTIVE_FROM,
      ],
    );
  }
}
