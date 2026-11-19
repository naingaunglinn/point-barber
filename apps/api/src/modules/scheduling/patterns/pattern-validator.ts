import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@point/shared';

// The business checks of a pattern save (P2.PAT.02 · P2-RULE-07 · design D3 step 5), after the schema
// (400) and before any write. Pure: the caller passes the company setting
// `schedule.cross_branch_gap_minutes` and the employee's assignments on `effective_from`
// (`Assignments.assignmentsOf`). Every failure is collected — days in the order sent, then segments in
// the order sent, a segment's gap before its branch; the caller answers 422 with `code` = the first and
// `errors[]` = all.
//
// - Cross-branch gap (D-SCH-02): in `start_time` order, two consecutive segments of a day at different
//   branches need `next.start − previous.end ≥ gap_minutes`; else `cross_branch_gap` on the later one,
//   with `{ needed, actual, after_segment }` (`after_segment` = the earlier one's index as sent —
//   reading 5). Consecutive segments at one branch may touch.
// - Assignment (owner PT4): each segment's branch needs an assignment effective on `effective_from`; an
//   assignment that ends later passes (generation stops at its end). Else `not_assigned_to_branch` on
//   the segment's `branch_id`.

export interface PatternCheckSegment {
  readonly branch_id: string;
  /** `HH:MM`, Myanmar Time — already checked by the schema. */
  readonly start_time: string;
  readonly end_time: string;
}

export interface PatternCheckSet {
  /** The save's start date `D`, `YYYY-MM-DD`. */
  readonly effective_from: string;
  readonly days: readonly {
    readonly day_of_week: number;
    readonly segments: readonly PatternCheckSegment[];
  }[];
}

export interface PatternAssignment {
  readonly branch_id: string;
  readonly effective_from: string;
  /** null = open; both ends inclusive. */
  readonly effective_to: string | null;
}

export interface PatternCheckContext {
  /** `schedule.cross_branch_gap_minutes` of the company. */
  readonly gap_minutes: number;
  readonly assignments: readonly PatternAssignment[];
}

export interface GapParams {
  readonly needed: number;
  readonly actual: number;
  readonly after_segment: number;
}

export type PatternFailure =
  | {
      readonly field: string;
      readonly code: typeof ErrorCode.CROSS_BRANCH_GAP;
      readonly params: GapParams;
    }
  | { readonly field: string; readonly code: typeof ErrorCode.NOT_ASSIGNED_TO_BRANCH };

function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** The gap failures of one day, by the index (as sent) of the later segment of each pair. */
function gapFailures(
  segments: readonly PatternCheckSegment[],
  needed: number,
): Map<number, GapParams> {
  const ordered = segments
    .map((segment, index) => ({ ...segment, index }))
    .sort((a, b) => {
      const byStart = minutesOf(a.start_time) - minutesOf(b.start_time);
      return byStart === 0 ? a.index - b.index : byStart;
    });
  const failures = new Map<number, GapParams>();
  for (const [position, next] of ordered.entries()) {
    const previous = ordered[position - 1];
    if (previous === undefined || previous.branch_id === next.branch_id) continue;
    const actual = minutesOf(next.start_time) - minutesOf(previous.end_time);
    if (actual < needed)
      failures.set(next.index, { needed, actual, after_segment: previous.index });
  }
  return failures;
}

@Injectable()
export class PatternValidator {
  check(set: PatternCheckSet, context: PatternCheckContext): PatternFailure[] {
    const assigned = new Set(
      context.assignments
        .filter(
          (row) =>
            row.effective_from <= set.effective_from &&
            (row.effective_to === null || row.effective_to >= set.effective_from),
        )
        .map((row) => row.branch_id),
    );
    return set.days.flatMap((day, i) => {
      const gaps = gapFailures(day.segments, context.gap_minutes);
      return day.segments.flatMap((segment, j) => {
        const field = `days[${i}].segments[${j}]`;
        const failures: PatternFailure[] = [];
        const gap = gaps.get(j);
        if (gap !== undefined)
          failures.push({ field, code: ErrorCode.CROSS_BRANCH_GAP, params: gap });
        if (!assigned.has(segment.branch_id)) {
          failures.push({ field: `${field}.branch_id`, code: ErrorCode.NOT_ASSIGNED_TO_BRANCH });
        }
        return failures;
      });
    });
  }
}
