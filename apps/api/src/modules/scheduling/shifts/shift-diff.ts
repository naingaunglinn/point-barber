import type { PlannedShift } from './shift-planner.js';

// The diff of one date (design D4 step 5 · P2-RULE-07 · owner PT5), pure. `want` = what the set produces
// on the date, `have` = the active PATTERN shifts the employee has on it:
// - in both (same branch, `starts_at`, `ends_at` and `schedule_pattern_id`) → untouched;
// - only in `have` → archived, or — when an attendance row points at it — converted to MANUAL (the date
//   is then a manual day, so the rest of `want` is dropped);
// - only in `want` → inserted.
// A manual day (any MANUAL shift, active or archived) is skipped entirely. The caller runs the archives
// and conversions before the inserts, so a changed segment never meets its own old row in the EXCLUDE.

/** An active PATTERN shift of the date, as read. */
export interface HaveShift {
  readonly id: string;
  readonly branch_id: string;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly schedule_pattern_id: string | null;
}

export interface DayDiff {
  /** Ids to set `archived_at` on. */
  readonly archive: readonly string[];
  /** Ids to set `source` = MANUAL on (attendance points at them). */
  readonly convert: readonly string[];
  readonly insert: readonly PlannedShift[];
}

// Instants are compared as milliseconds: the database returns Dates and the planner builds Dates, but a
// string and a Date of one instant never compare equal.
const keyOf = (shift: {
  readonly branch_id: string;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly schedule_pattern_id: string | null;
}): string =>
  `${shift.branch_id} ${String(shift.starts_at.getTime())} ${String(shift.ends_at.getTime())} ${shift.schedule_pattern_id ?? ''}`;

export function diffDay(
  want: readonly PlannedShift[],
  have: readonly HaveShift[],
  attended: ReadonlySet<string>,
  options: { readonly manual?: boolean } = {},
): DayDiff {
  if (options.manual === true) return { archive: [], convert: [], insert: [] };
  const wanted = new Set(want.map(keyOf));
  const present = new Set(have.map(keyOf));
  const dropped = have.filter((shift) => !wanted.has(keyOf(shift)));
  const convert = dropped.filter((shift) => attended.has(shift.id)).map((shift) => shift.id);
  const archive = dropped.filter((shift) => !attended.has(shift.id)).map((shift) => shift.id);
  const insert =
    convert.length > 0 ? [] : want.filter((shift) => !present.has(keyOf(shift)));
  return { archive, convert, insert };
}
