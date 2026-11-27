import { ErrorCode, WebsiteLimits, plusDays } from '@point/shared';

// The date rules of a closure (P8-RULE-12 · add-website-management design D6 · proposal readings 5 and 6).
// Dates are `YYYY-MM-DD` business dates (D-PLT-15), which sort as text.

export type ClosureState = 'upcoming' | 'current' | 'ended' | 'archived';

/** What the dates of a created closure break, in the order of reading 6; null when they are fine. */
export interface ClosureDateProblem {
  readonly code: typeof ErrorCode.DATE_IN_PAST | typeof ErrorCode.RANGE_TOO_LONG;
  readonly context?: { readonly max_days: number };
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
  // `end − start + 1 > 366` ⇔ the end is past start + 365 days.
  if (end > plusDays(start, WebsiteLimits.CLOSURE_MAX_DAYS - 1)) {
    return {
      code: ErrorCode.RANGE_TOO_LONG,
      context: { max_days: WebsiteLimits.CLOSURE_MAX_DAYS },
    };
  }
  return null;
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
