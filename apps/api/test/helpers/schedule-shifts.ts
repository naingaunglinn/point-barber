import { randomUUID } from 'node:crypto';

import { FIXTURE_IDS } from '@point/shared/testing';

import { TransactionRunner } from '../../src/common/database/transaction-runner.js';
import { ScheduleLock } from '../../src/modules/scheduling/patterns/schedule-lock.js';
import {
  type GenerateResult,
  ShiftGenerator,
} from '../../src/modules/scheduling/shifts/shift-generator.js';
import type { SeededApp } from './seeded.js';

// add-schedule-patterns part A4 — what the generation tests share: one generation unit as the nightly job
// runs it (the schedule lock, then the generator, in one transaction), the shifts of an employee as the
// scenarios count them, and the raw rows the fixtures do not seed (MANUAL shifts, an attendance record).

export interface ShiftRow {
  readonly id: string;
  readonly date: string;
  /** `HH:MM-HH:MM` in Myanmar Time. */
  readonly hours: string;
  readonly source: number;
  readonly archived: boolean;
  readonly pattern: string | null;
  readonly updated_at: Date;
}

/** One generation unit: `ScheduleLock` then `ShiftGenerator.run` from today (design D5 — one employee). */
export const generateUnit = (s: SeededApp, employeeId: string): Promise<GenerateResult> =>
  s.app.get(TransactionRunner).run(async (tx) => {
    await s.app.get(ScheduleLock).acquire(tx, employeeId);
    return s.app.get(ShiftGenerator).run(tx, { employee_id: employeeId, from: '2000-01-01' });
  });

/** Every shift of the employee, archived ones included, by date and start. */
export const shiftsOf = (s: SeededApp, employeeId: string): Promise<ShiftRow[]> =>
  s.prisma.$queryRaw<ShiftRow[]>`
    SELECT id, shift_date::text AS date,
           to_char(starts_at AT TIME ZONE 'Asia/Yangon', 'HH24:MI') || '-' ||
           to_char(ends_at AT TIME ZONE 'Asia/Yangon', 'HH24:MI') AS hours,
           source::int AS source, archived_at IS NOT NULL AS archived,
           schedule_pattern_id AS pattern, updated_at
    FROM schedule_shifts WHERE employee_id = ${employeeId}::uuid
    ORDER BY shift_date, starts_at, archived_at IS NOT NULL, id`;

export const activeShifts = async (s: SeededApp, employeeId: string): Promise<ShiftRow[]> =>
  (await shiftsOf(s, employeeId)).filter((shift) => !shift.archived);

/** A shift row written directly: a MANUAL day marker, or a PATTERN shift of a past date. */
export async function insertShift(
  s: SeededApp,
  row: {
    readonly employee_id: string;
    readonly branch_id: string;
    readonly date: string;
    readonly start: string;
    readonly end: string;
    readonly source: 1 | 2;
    readonly archived?: boolean;
  },
): Promise<string> {
  const id = randomUUID();
  await s.prisma.$executeRaw`
    INSERT INTO schedule_shifts (id, employee_id, branch_id, shift_date, starts_at, ends_at, source, archived_at)
    VALUES (${id}::uuid, ${row.employee_id}::uuid, ${row.branch_id}::uuid, ${row.date}::date,
            ${new Date(`${row.date}T${row.start}:00+06:30`)}, ${new Date(`${row.date}T${row.end}:00+06:30`)},
            ${row.source}, ${row.archived === true ? new Date() : null})`;
  return id;
}

/** A manual attendance record of `date` (09:02 clock-in) pointing at the shift (D-ATT-06). */
export async function insertAttendance(
  s: SeededApp,
  row: { readonly shift_id: string; readonly employee_id: string; readonly branch_id: string; readonly date: string },
): Promise<void> {
  await s.prisma.$executeRaw`
    INSERT INTO attendance_records
      (id, employee_id, branch_id, business_date, clock_in_at, method, manual_reason, entered_by_user_id,
       schedule_shift_id)
    VALUES (${randomUUID()}::uuid, ${row.employee_id}::uuid, ${row.branch_id}::uuid, ${row.date}::date,
            ${new Date(`${row.date}T09:02:00+06:30`)}, 2, 1, ${FIXTURE_IDS.users.E002}::uuid,
            ${row.shift_id}::uuid)`;
}
