import { Injectable } from '@nestjs/common';
import { ErrorCode, todayMmt } from '@point/shared';

import { GrantSet, GrantSource } from '../../../common/access/grant-set.js';
import { Clock } from '../../../common/clock/clock.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import type { SaleViewer } from './sale-view.js';

// The caller as the visit and sale services see them (add-walkin-visit-checkout design D2 ·
// AD-PERM-02 · P4-RULE-03): the actor of the request and, per branch, the three codes that let someone
// else act on a sale. Built from the grants the access guard put on the request; a @Self() route has
// none, so they are built here the same way — from the people tables, once per request (D-ROLE-06).
@Injectable()
export class SaleViewers {
  constructor(
    private readonly grantSource: GrantSource,
    private readonly clock: Clock,
  ) {}

  async current(): Promise<SaleViewer> {
    const ctx = RequestContext.current();
    if (ctx?.user_id === undefined) throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
    if (ctx.employee_id === undefined) throw new ProblemException(ErrorCode.FORBIDDEN, 403);
    const employeeId = ctx.employee_id;
    ctx.grants ??= GrantSet.build(
      await this.grantSource.rowsFor(employeeId),
      todayMmt(this.clock.now()),
    );
    const grants = ctx.grants;
    return {
      actor: { user_id: ctx.user_id, employee_id: employeeId },
      rightsAt: (branchId) => ({
        visit_update: grants.covers('visit.update', branchId),
        visit_delete: grants.covers('visit.delete', branchId),
        sale_finish_override: grants.covers('sale.finish_override', branchId),
      }),
      can: (code, branchId) => grants.covers(code, branchId),
    };
  }
}
