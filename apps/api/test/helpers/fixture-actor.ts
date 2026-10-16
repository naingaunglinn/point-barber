import { ErrorCode } from '@point/shared';
import type { NextFunction, Request, Response } from 'express';

import { ProblemException } from '../../src/common/http/problem.exception.js';
import { RequestContext } from '../../src/common/http/request-context.js';

// Test application only (design D14 fixture mechanism): headers that put what the session and access
// guards of add-foundation-auth-access group 4 will resolve into the request context — the
// signed-in caller, the one branch the access guard resolved, or the guard's refusal. Registered by
// startTestApp after the request-id middleware — never in AppModule.
export const FIXTURE_USER_HEADER = 'X-Fixture-User';
export const FIXTURE_SESSION_HEADER = 'X-Fixture-Session';
export const FIXTURE_EMPLOYEE_HEADER = 'X-Fixture-Employee';
export const FIXTURE_BRANCH_HEADER = 'X-Fixture-Branch';
/** Any value: the request is refused with 403 forbidden before the handler, as a guard would. */
export const FIXTURE_REFUSE_HEADER = 'X-Fixture-Refuse';

export function fixtureActorMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const ctx = RequestContext.current();
  if (ctx === undefined) {
    next();
    return;
  }
  const user = req.header(FIXTURE_USER_HEADER);
  const session = req.header(FIXTURE_SESSION_HEADER);
  const employee = req.header(FIXTURE_EMPLOYEE_HEADER);
  const branch = req.header(FIXTURE_BRANCH_HEADER);
  if (user !== undefined) ctx.user_id = user;
  if (session !== undefined) ctx.session_id = session;
  if (employee !== undefined) ctx.employee_id = employee;
  if (branch !== undefined) ctx.branch_id = branch;
  if (req.header(FIXTURE_REFUSE_HEADER) !== undefined) {
    next(new ProblemException(ErrorCode.FORBIDDEN, 403));
    return;
  }
  next();
}
