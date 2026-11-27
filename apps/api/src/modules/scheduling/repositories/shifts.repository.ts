import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { Tx } from '../../../common/database/transaction-runner.js';
import type { PlannedShift } from '../shifts/shift-planner.js';

// `schedule_shifts` (DB Part 2 v1.3 — the scheduling module owns it) and the attendance rows that point at
// a shift (`attendance_records`, `attendance_exceptions` — Part 5, also the scheduling module's, design D1).
// `source` 1 PATTERN · 2 MANUAL; `shift_date` = the Myanmar date of `starts_at`; `archived_at` marks a
// removed shift; rows are never deleted (D-DAT-05). EXCLUDE `schedule_shifts_no_overlap` forbids two
// non-archived shifts of one employee overlapping — the generator archives before it inserts.

export const SHIFT_SOURCE = { PATTERN: 1, MANUAL: 2 } as const;

const shiftSchema = z.object({
  id: z.uuid(),
  branch_id: z.uuid(),
  shift_date: z.string(),
  starts_at: z.date(),
  ends_at: z.date(),
  source: z.number(),
  schedule_pattern_id: z.uuid().nullable(),
  archived: z.boolean(),
});

const activeShiftSchema = z.object({
  branch_id: z.uuid(),
  shift_date: z.string(),
  starts_at: z.date(),
  ends_at: z.date(),
});

/** An active shift of an employee: branch, date and instants. */
export type ActiveShift = z.infer<typeof activeShiftSchema>;

/** A stored shift of an employee, archived ones included. */
export type StoredShift = z.infer<typeof shiftSchema>;

@Injectable()
export class ShiftsRepository {
  /**
   * Every shift of the employee dated `from` … `to`, active and archived, `FOR UPDATE` (design D4 step 2,
   * under `ScheduleLock`), by date and start.
   */
  async inRange(tx: Tx, employeeId: string, from: string, to: string): Promise<StoredShift[]> {
    const rows = await tx.$queryRaw<unknown[]>`
      SELECT id, branch_id, shift_date::text AS shift_date, starts_at, ends_at, source,
             schedule_pattern_id, archived_at IS NOT NULL AS archived
      FROM schedule_shifts
      WHERE employee_id = ${employeeId}::uuid
        AND shift_date BETWEEN ${from}::date AND ${to}::date
      ORDER BY shift_date, starts_at, id
      FOR UPDATE`;
    return z.array(shiftSchema).parse(rows);
  }

  /** The ids among `shiftIds` that an attendance record or exception points at (P2-RULE-07 · P5-RULE-14). */
  async attendedAmong(tx: Tx, shiftIds: readonly string[]): Promise<Set<string>> {
    if (shiftIds.length === 0) return new Set();
    const rows = await tx.$queryRaw<unknown[]>`
      SELECT schedule_shift_id AS id FROM attendance_records
      WHERE schedule_shift_id = ANY(${shiftIds}::uuid[])
      UNION
      SELECT schedule_shift_id AS id FROM attendance_exceptions
      WHERE schedule_shift_id = ANY(${shiftIds}::uuid[])`;
    return new Set(
      z
        .array(z.object({ id: z.uuid() }))
        .parse(rows)
        .map((row) => row.id),
    );
  }

  async archive(tx: Tx, ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await tx.$executeRaw`
      UPDATE schedule_shifts SET archived_at = ${at}, updated_at = ${at}
      WHERE id = ANY(${ids}::uuid[]) AND archived_at IS NULL`;
  }

  /** Makes the shifts MANUAL, keeping their times and pattern row (design D4 step 5). */
  async convertToManual(tx: Tx, ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await tx.$executeRaw`
      UPDATE schedule_shifts SET source = ${SHIFT_SOURCE.MANUAL}, updated_at = ${at}
      WHERE id = ANY(${ids}::uuid[]) AND archived_at IS NULL`;
  }

  async insertPattern(
    tx: Tx,
    employeeId: string,
    rows: readonly (PlannedShift & { readonly id: string })[],
    at: Date,
  ): Promise<void> {
    for (const row of rows) {
      await tx.$executeRaw`
        INSERT INTO schedule_shifts
          (id, employee_id, branch_id, shift_date, starts_at, ends_at, source, schedule_pattern_id,
           created_at, updated_at)
        VALUES (${row.id}::uuid, ${employeeId}::uuid, ${row.branch_id}::uuid, ${row.shift_date}::date,
                ${row.starts_at}, ${row.ends_at}, ${SHIFT_SOURCE.PATTERN},
                ${row.schedule_pattern_id}::uuid, ${at}, ${at})`;
    }
  }

  /** The employee's active shifts on `dates`, by date and start — the booking warning's yardstick (D8). */
  async activeOn(tx: Tx, employeeId: string, dates: readonly string[]): Promise<ActiveShift[]> {
    if (dates.length === 0) return [];
    const rows = await tx.$queryRaw<unknown[]>`
      SELECT branch_id, shift_date::text AS shift_date, starts_at, ends_at
      FROM schedule_shifts
      WHERE employee_id = ${employeeId}::uuid AND archived_at IS NULL
        AND shift_date = ANY(${dates}::date[])
      ORDER BY shift_date, starts_at, id`;
    return z.array(activeShiftSchema).parse(rows);
  }

  /** The branches of the active shifts dated `from` … `to`, per employee (P2.SHF.06 · owner PT6). */
  async branchesOf(
    db: Tx,
    employeeIds: readonly string[],
    from: string,
    to: string,
  ): Promise<{ employee_id: string; branch_id: string }[]> {
    if (employeeIds.length === 0) return [];
    const rows = await db.$queryRaw<unknown[]>`
      SELECT DISTINCT employee_id, branch_id FROM schedule_shifts
      WHERE employee_id = ANY(${employeeIds}::uuid[]) AND archived_at IS NULL
        AND shift_date BETWEEN ${from}::date AND ${to}::date`;
    return z.array(z.object({ employee_id: z.uuid(), branch_id: z.uuid() })).parse(rows);
  }
}
