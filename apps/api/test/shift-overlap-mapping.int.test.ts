import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isShiftOverlap, sqlStateOf } from '../src/common/database/errors.js';
import { uuidV7 } from '../src/common/http/uuid-v7.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-schedule-patterns design D4 — the DB EXCLUDE `schedule_shifts_no_overlap` (D-SCH-02) refuses a second
// overlapping shift of one person with SQLSTATE 23P01, and `isShiftOverlap` reads that real error (the
// filter then answers 409 `shift_overlap` — problem.filter.test.ts). Rows are written in a transaction
// that is rolled back.
const { B3 } = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;

let s: SeededApp;
beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T11:00:00+06:30'));
});
afterAll(() => s.close());

const insert = (tx: Pick<SeededApp['prisma'], '$executeRaw'>, from: string, to: string) =>
  tx.$executeRaw`
    INSERT INTO schedule_shifts (id, employee_id, branch_id, shift_date, starts_at, ends_at, source)
    VALUES (${uuidV7(Date.now())}::uuid, ${E.E004}::uuid, ${B3}::uuid, '2026-10-12'::date,
            ${from}::timestamptz, ${to}::timestamptz, 1)`;

describe('add-schedule-patterns · scheduling · the shift EXCLUDE is read as shift_overlap', () => {
  it('an overlapping second shift fails with 23P01 and isShiftOverlap says so', async () => {
    const failure = await s.prisma
      .$transaction(async (tx) => {
        await insert(tx, '2026-10-12T10:00:00+06:30', '2026-10-12T14:00:00+06:30');
        await insert(tx, '2026-10-12T13:00:00+06:30', '2026-10-12T18:00:00+06:30');
        return null;
      })
      .catch((error: unknown) => error);
    expect([sqlStateOf(failure), isShiftOverlap(failure)]).toStrictEqual(['23P01', true]);
  });

  it('shifts that only touch are fine, and nothing stays after the rollback', async () => {
    const result = await s.prisma
      .$transaction(async (tx) => {
        await insert(tx, '2026-10-12T10:00:00+06:30', '2026-10-12T14:00:00+06:30');
        await insert(tx, '2026-10-12T14:00:00+06:30', '2026-10-12T18:00:00+06:30');
        throw new Error('rollback');
      })
      .catch((error: unknown) => error);
    expect(result).toBeInstanceOf(Error);
    const rows = await s.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM schedule_shifts WHERE employee_id = ${E.E004}::uuid`;
    expect(Number(rows[0]?.n)).toBe(0);
  });
});
