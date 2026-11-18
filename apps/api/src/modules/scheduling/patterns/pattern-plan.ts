import { type PatternDay, plusDays } from '@point/shared';

// The rows a pattern save writes (P2-RULE-04 · P2-RULE-07 · D-DB-06 · owner PT2 · design D3 steps 6 – 7),
// as a pure plan over the set effective on the save's start date `D` and the start of the next later set.
//
// - `effective_to` of the new set = the sent end (none = open), never later than the next set's start − 1
//   (owner PT2); the later set is never changed.
// - Same start date (the stored set starts on `D`) = edit in place: a stored row whose (`day_of_week`,
//   `branch_id`, `start_time`, `end_time`) is sent again keeps its id (its end is rewritten when it
//   changed), the other stored rows are archived, the other sent segments are inserted (reading 4).
// - Otherwise the stored set (if any) ends on `D − 1` and every sent segment is inserted from `D`.
// - Nothing to write (same start, every row matched, same end) → `changed` = false: no generation, no
//   audit row, no event (step 7).

/** A stored, non-archived `schedule_patterns` row; times `HH:MM`, dates `YYYY-MM-DD`. */
export interface StoredSegment {
  readonly id: string;
  readonly branch_id: string;
  readonly day_of_week: number;
  readonly start_time: string;
  readonly end_time: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
}

export interface NewSegment {
  readonly day_of_week: number;
  readonly branch_id: string;
  readonly start_time: string;
  readonly end_time: string;
}

export interface SavePlan {
  /** The stored end of the new set; null = open. */
  readonly effective_to: string | null;
  /** The stored set that ends the day before `D` (a set from a new date), or null. */
  readonly close: { readonly ids: readonly string[]; readonly effective_to: string } | null;
  /** Kept rows whose end changes (edit in place). */
  readonly retime: readonly string[];
  readonly archive: readonly string[];
  readonly insert: readonly NewSegment[];
  readonly changed: boolean;
}

const keyOf = (s: Omit<NewSegment, 'day_of_week'> & { readonly day_of_week: number }): string =>
  `${s.day_of_week} ${s.branch_id} ${s.start_time} ${s.end_time}`;

export function planSave(input: {
  /** The rows of the set effective on `from` (one `effective_from`), or none. */
  readonly old: readonly StoredSegment[];
  /** The start of the first non-archived set after `from`, or null. */
  readonly nextFrom: string | null;
  readonly from: string;
  readonly to: string | null | undefined;
  readonly days: readonly PatternDay[];
}): SavePlan {
  const { old, nextFrom, from } = input;
  const cap = nextFrom === null ? null : plusDays(nextFrom, -1);
  const sent = input.to ?? null;
  const effectiveTo = cap === null ? sent : sent === null || sent > cap ? cap : sent;
  const segments: NewSegment[] = input.days.flatMap((day) =>
    day.segments.map((segment) => ({ day_of_week: day.day_of_week, ...segment })),
  );

  const inPlace = old.length > 0 && old.every((row) => row.effective_from === from);
  if (!inPlace) {
    const close =
      old.length === 0 ? null : { ids: old.map((row) => row.id), effective_to: plusDays(from, -1) };
    return {
      effective_to: effectiveTo,
      close,
      retime: [],
      archive: [],
      insert: segments,
      changed: close !== null || segments.length > 0,
    };
  }

  const unmatched = new Map<string, StoredSegment[]>();
  for (const row of old) unmatched.set(keyOf(row), [...(unmatched.get(keyOf(row)) ?? []), row]);
  const kept: StoredSegment[] = [];
  const insert: NewSegment[] = [];
  for (const segment of segments) {
    const match = unmatched.get(keyOf(segment))?.shift();
    if (match === undefined) insert.push(segment);
    else kept.push(match);
  }
  const archive = [...unmatched.values()].flat().map((row) => row.id);
  const retime = kept.filter((row) => row.effective_to !== effectiveTo).map((row) => row.id);
  return {
    effective_to: effectiveTo,
    close: null,
    retime,
    archive,
    insert,
    changed: archive.length > 0 || insert.length > 0 || retime.length > 0,
  };
}
