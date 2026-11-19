import {
  ErrorCode,
  type LateEntryTimeMember,
  type LateEntryTimes,
  lateEntryOrderViolation,
} from '@point/shared';

import { ProblemException } from '../../../common/http/problem.exception.js';

// The two checks every write on a late-entry visit makes with its entered time (add-late-entry design
// D1 / D4 · P4-RULE-13): the time is required on such a visit — a defaulted "now" would land the sale on
// the wrong day — and the four times stay in order and not later than now (LE-1). Used by delivery
// (START, COMPLETE) and sales (payment add, FINISH).

/** The entered time as an instant; 400 `validation` naming the member when it was not sent. */
export function enteredTime(value: string | null | undefined, field: LateEntryTimeMember): Date {
  if (value === undefined || value === null)
    throw new ProblemException(ErrorCode.VALIDATION, 400, {
      errors: [{ field, code: 'invalid_type', params: { expected: 'string' } }],
    });
  return new Date(value);
}

/** 422 `late_entry_time` when the times given are out of order or later than now. */
export function assertLateEntryOrder(times: LateEntryTimes): void {
  if (lateEntryOrderViolation(times) !== null)
    throw new ProblemException(ErrorCode.LATE_ENTRY_TIME, 422);
}
