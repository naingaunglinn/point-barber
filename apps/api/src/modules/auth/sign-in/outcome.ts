import { ErrorCode } from '@point/shared';

import { toMmtIso } from '../../../common/http/mmt-iso.js';
import { ProblemException } from '../../../common/http/problem.exception.js';

// What a sign-in returns (design D3): an expected refusal is an outcome, not an exception, so the
// transaction that recorded it — the counter, the lock, the audit rows — commits. The controller
// hands a refusal to toProblem(), the one mapper; it makes no business decision (CG-API-01).

export type SignInOutcome =
  | {
      readonly kind: 'ok';
      readonly userId: string;
      readonly sessionId: string;
      readonly token: string;
    }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'locked'; readonly until: Date }
  | { readonly kind: 'rate_limited'; readonly retryAfter: number };

export type Refusal = Exclude<SignInOutcome, { kind: 'ok' }>;

/** The problem of a refused sign-in: otp_invalid, login_locked (`until`) or rate_limited. */
export function toProblem(outcome: Refusal): ProblemException {
  switch (outcome.kind) {
    case 'invalid':
      return new ProblemException(ErrorCode.OTP_INVALID, 401);
    case 'locked':
      return new ProblemException(ErrorCode.LOGIN_LOCKED, 401, {
        extensions: { until: toMmtIso(outcome.until) },
      });
    case 'rate_limited':
      return rateLimited(outcome.retryAfter);
  }
}

/** 429 with `retry_after` and the same `Retry-After` header (API-LIM-02). */
export const rateLimited = (retryAfter: number): ProblemException =>
  new ProblemException(ErrorCode.RATE_LIMITED, 429, {
    extensions: { retry_after: retryAfter },
    headers: { 'Retry-After': String(retryAfter) },
  });
