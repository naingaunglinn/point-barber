import { Injectable } from '@nestjs/common';
import { EmployeeStatus, isoWeekdayOf, mmtInstant } from '@point/shared';

import type { AssignmentPeriod } from '../../people/index.js';
import type { StoredSegment } from '../patterns/pattern-plan.js';

// The shifts a pattern set produces on one business date (design D4 step 4 · P2-RULE-07 · D-SCH-01 ·
// D-PLT-15), as a pure function: for each segment of the set effective on `date` whose weekday is the
// date's — only when the employee is ACTIVE and an assignment of the segment's branch is effective on
// `date` — a shift from `date` + `start_time` to `date` + `end_time` in Asia/Yangon. A weekday with no
// segment is a day off.

/** A shift a set produces: the diff key is (`branch_id`, `starts_at`, `ends_at`, `schedule_pattern_id`). */
export interface PlannedShift {
  readonly branch_id: string;
  readonly shift_date: string;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly schedule_pattern_id: string;
}

export interface PlanContext {
  /** `employees.status`; null when there is no such employee. */
  readonly status: number | null;
  /** The employee's assignments overlapping the run (ended ones included). */
  readonly assignments: readonly AssignmentPeriod[];
}

const covers = (from: string, to: string | null, date: string): boolean =>
  from <= date && (to === null || date <= to);

/** `rows` = the non-archived pattern rows of the employee; those effective on `date` count. */
export function planShifts(
  rows: readonly StoredSegment[],
  date: string,
  ctx: PlanContext,
): PlannedShift[] {
  if (ctx.status !== EmployeeStatus.ACTIVE) return [];
  const weekday = isoWeekdayOf(date);
  return rows
    .filter(
      (row) =>
        row.day_of_week === weekday &&
        covers(row.effective_from, row.effective_to, date) &&
        ctx.assignments.some(
          (assignment) =>
            assignment.branch_id === row.branch_id &&
            covers(assignment.effective_from, assignment.effective_to, date),
        ),
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((row) => ({
      branch_id: row.branch_id,
      shift_date: date,
      starts_at: new Date(mmtInstant(date, row.start_time)),
      ends_at: new Date(mmtInstant(date, row.end_time)),
      schedule_pattern_id: row.id,
    }));
}

@Injectable()
export class ShiftPlanner {
  plan(rows: readonly StoredSegment[], date: string, ctx: PlanContext): PlannedShift[] {
    return planShifts(rows, date, ctx);
  }
}
