import { ErrorCode, WebsiteLimits, plusDays } from '@point/shared';

// The date rules of a closure (P8-RULE-12 · add-website-management design D6 · proposal readings 5 and 6).
// Dates are `YYYY-MM-DD` business dates (D-PLT-15), which sort as text.

export type ClosureState = 'upcoming' | 'current' | 'ended' | 'archived';

/** What the dates of a created closure break, in the order of reading 6; null when they are fine. */
export interface ClosureDateProblem {
  readonly code: typeof ErrorCode.DATE_IN_PAST | typeof ErrorCode.RANGE_TOO_LONG;
  readonly context?: { readonly max_days: number };
}

/** The 366-day limit with both ends counted: `end − start + 1 > 366` ⇔ the end is past start + 365 days. */
function rangeProblem(start: string, end: string): ClosureDateProblem | null {
  if (end <= plusDays(start, WebsiteLimits.CLOSURE_MAX_DAYS - 1)) return null;
  return {
    code: ErrorCode.RANGE_TOO_LONG,
    context: { max_days: WebsiteLimits.CLOSURE_MAX_DAYS },
  };
}

/**
 * `start ≥ today` (else `date_in_past`), then at most 366 closed days with both ends counted
 * (else `range_too_long`). `end ≥ start` is the schema's (400).
 */
export function closureDateProblem(
  start: string,
  end: string,
  today: string,
): ClosureDateProblem | null {
  if (start < today) return { code: ErrorCode.DATE_IN_PAST };
  return rangeProblem(start, end);
}

/** What an edit breaks: a 400 on `end_date`, or a 422 with its code (and context). */
export interface ClosureEditProblem {
  readonly status: 400 | 422;
  readonly code: string;
  readonly context?: { readonly max_days: number };
}

interface ClosureDates {
  readonly start_date: string;
  readonly end_date: string;
}

/**
 * The checks of an edit after the archived and stale ones (proposal reading 6 · owner WM4 ★): an ended
 * closure is history (`closure_past`); the merged end before the start is a 400 on `end_date`; a started
 * closure keeps its start (`closure_started`) and may only end today or later (`date_in_past`); an
 * upcoming one starts today or later; then the 366-day limit. `merged` = the stored dates with the body's.
 */
export function closureEditProblem(
  stored: ClosureDates,
  merged: ClosureDates,
  today: string,
): ClosureEditProblem | null {
  if (stored.end_date < today) return { status: 422, code: ErrorCode.CLOSURE_PAST };
  if (merged.end_date < merged.start_date) return { status: 400, code: ErrorCode.END_BEFORE_START };
  if (stored.start_date <= today) {
    if (merged.start_date !== stored.start_date) {
      return { status: 422, code: ErrorCode.CLOSURE_STARTED };
    }
    if (merged.end_date < today) return { status: 422, code: ErrorCode.DATE_IN_PAST };
  } else if (merged.start_date < today) {
    return { status: 422, code: ErrorCode.DATE_IN_PAST };
  }
  const range = rangeProblem(merged.start_date, merged.end_date);
  return range === null ? null : { status: 422, ...range };
}

/**
 * Archiving (P8.WEB.08 · D-DAT-05): only while no past day changes — a closure that starts today or
 * later. One that started is `closure_started` while it runs and `closure_past` once it has ended.
 */
export function closureArchiveProblem(
  closure: ClosureDates,
  today: string,
): typeof ErrorCode.CLOSURE_STARTED | typeof ErrorCode.CLOSURE_PAST | null {
  if (closure.start_date >= today) return null;
  return closure.end_date >= today ? ErrorCode.CLOSURE_STARTED : ErrorCode.CLOSURE_PAST;
}

/** `state` of a closure — computed from its dates, `archived_at` and today, never stored. */
export function closureState(
  closure: {
    readonly start_date: string;
    readonly end_date: string;
    readonly archived_at: Date | null;
  },
  today: string,
): ClosureState {
  if (closure.archived_at !== null) return 'archived';
  if (closure.end_date < today) return 'ended';
  return closure.start_date > today ? 'upcoming' : 'current';
}
