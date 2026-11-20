import { Injectable } from '@nestjs/common';
import { type ScheduleWarning, businessDateOf, plusDays } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Assignments, PeopleDirectory } from '../../people/index.js';
import { SettingsReader } from '../../platform/index.js';
import { PatternsRepository } from '../repositories/patterns.repository.js';
import { SHIFT_SOURCE, ShiftsRepository } from '../repositories/shifts.repository.js';
import { diffDay } from './shift-diff.js';
import { type PlannedShift, ShiftPlanner } from './shift-planner.js';

// The generator (design D4 · P2-RULE-07 · ADR-002 · owner PT5): the one place that turns pattern sets into
// `schedule_shifts` — used by the save, the nightly job and P2.SHF.06 (and, in part 2, the day reset).
// The caller holds `ScheduleLock` for the employee, in the same transaction.
//
//   1. Clip: `from` = max(from, today), `to` = min(to, today + booking.advance_window_days + 7) — never a
//      date before today, so a past shift is never inserted, archived or converted.
//   2. Read: the employee's status, the pattern rows effective in the range, the assignments overlapping
//      it, and the shifts dated in it (active and archived, FOR UPDATE).
//   3. A date with any MANUAL shift, active or archived, is a manual day — skipped entirely.
//   4. Every other date: `ShiftPlanner.plan` against the active PATTERN shifts → `diffDay`.
//   5. Writes: archives and conversions first (the EXCLUDE ignores archived rows, so a changed segment
//      never collides with its own old shift), then the inserts. A run that finds nothing writes nothing.
//   6. Result: the dates with any write and the `shift_kept_attendance` warning (or none).

export interface GenerateResult {
  /** Dates (ascending) with an archived, converted or inserted shift. */
  readonly changed_dates: string[];
  readonly warnings: ScheduleWarning[];
}

const datesBetween = (from: string, to: string): string[] => {
  const dates: string[] = [];
  for (let date = from; date <= to; date = plusDays(date, 1)) dates.push(date);
  return dates;
};

@Injectable()
export class ShiftGenerator {
  constructor(
    private readonly clock: Clock,
    private readonly settings: SettingsReader,
    private readonly directory: PeopleDirectory,
    private readonly assignments: Assignments,
    private readonly patterns: PatternsRepository,
    private readonly shifts: ShiftsRepository,
    private readonly planner: ShiftPlanner,
  ) {}

  /** `to` omitted = the horizon, `today + booking.advance_window_days + 7`. */
  async run(
    tx: Tx,
    input: { readonly employee_id: string; readonly from: string; readonly to?: string },
  ): Promise<GenerateResult> {
    const now = this.clock.now();
    const today = businessDateOf(now);
    const { 'booking.advance_window_days': window } = await this.settings.effective([
      'booking.advance_window_days',
    ]);
    const horizon = plusDays(today, window + 7);
    const from = input.from > today ? input.from : today;
    const to = input.to === undefined || input.to > horizon ? horizon : input.to;
    if (from > to) return { changed_dates: [], warnings: [] };

    const employeeId = input.employee_id;
    const ctx = {
      status: await this.directory.statusOf(tx, employeeId),
      assignments: await this.assignments.assignmentsOf(tx, employeeId, { from, to }),
    };
    const rows = await this.patterns.effectiveIn(tx, employeeId, from, to);
    const stored = await this.shifts.inRange(tx, employeeId, from, to);

    const manualDays = new Set(
      stored
        .filter((shift) => shift.source === SHIFT_SOURCE.MANUAL)
        .map((shift) => shift.shift_date),
    );
    const patternShifts = stored.filter(
      (shift) =>
        shift.source === SHIFT_SOURCE.PATTERN &&
        !shift.archived &&
        !manualDays.has(shift.shift_date),
    );
    const attended = await this.shifts.attendedAmong(
      tx,
      patternShifts.map((shift) => shift.id),
    );

    const archive: string[] = [];
    const convert: { readonly id: string; readonly shift_date: string }[] = [];
    const insert: PlannedShift[] = [];
    const changed = new Set<string>();
    for (const date of datesBetween(from, to)) {
      if (manualDays.has(date)) continue;
      const diff = diffDay(
        this.planner.plan(rows, date, ctx),
        patternShifts.filter((shift) => shift.shift_date === date),
        attended,
      );
      archive.push(...diff.archive);
      convert.push(...diff.convert.map((id) => ({ id, shift_date: date })));
      insert.push(...diff.insert);
      if (diff.archive.length + diff.convert.length + diff.insert.length > 0) changed.add(date);
    }

    await this.shifts.archive(tx, archive, now);
    await this.shifts.convertToManual(
      tx,
      convert.map((shift) => shift.id),
      now,
    );
    await this.shifts.insertPattern(
      tx,
      employeeId,
      insert.map((shift) => ({ ...shift, id: uuidV7(now.getTime()) })),
      now,
    );

    return {
      changed_dates: [...changed].sort(),
      warnings:
        convert.length === 0
          ? []
          : [
              {
                code: 'shift_kept_attendance',
                items: convert.map((shift) => ({
                  shift_id: shift.id,
                  shift_date: shift.shift_date,
                })),
              },
            ],
    };
  }
}
