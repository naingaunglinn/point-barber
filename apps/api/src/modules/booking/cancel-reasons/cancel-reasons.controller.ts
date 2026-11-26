import { Controller, Get, Post } from '@nestjs/common';
import {
  type CancelReason,
  type CancelReasonCreate,
  type CancelReasonList,
  type CancelReasonListQuery,
  cancelReasonCreateSchema,
  cancelReasonListQuerySchema,
} from '@point/shared';

import { decide } from '../../../common/access/decide.js';
import { Can, Staff } from '../../../common/access/declarations.js';
import type { GrantSet } from '../../../common/access/grant-set.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { ZBody, ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../../platform/index.js';
import { CancelReasonReads } from './cancel-reason-reads.js';
import { CANCEL_REASON_CREATE, CancelReasonWrites } from './cancel-reason-writes.js';

// P3.CRS.01 – 05 (API Part 3 §3 · add-booking-cancel-reasons design D2): one access declaration each
// (API-PERM-02 · CG-API-02). Order of checks: guard (403) → Zod (400) → the row under its lock (404)
// → business rules (409).

/** The caller's grants, which the access guard built for this route's declaration (design D2). */
function callerGrants(): GrantSet {
  const grants = RequestContext.current()?.grants;
  if (grants === undefined) throw new Error('cancel reasons: the access guard built no grant set');
  return grants;
}

@Controller('v1/booking-cancel-reasons')
export class CancelReasonsController {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly reads: CancelReasonReads,
    private readonly writes: CancelReasonWrites,
  ) {}

  /**
   * P3.CRS.01 — every signed-in staff member (the cancel dialog); `include_archived=true` is a
   * management read: any `booking_cancel_reason.*` code at any scope (API-PERM-03), checked here
   * with the guard's own decision before anything is read.
   */
  @Get()
  @Staff()
  async list(
    @ZQuery(cancelReasonListQuerySchema) query: CancelReasonListQuery,
  ): Promise<CancelReasonList> {
    if (query.include_archived) {
      const decision = decide(
        { kind: 'canView', module: 'booking_cancel_reason' },
        callerGrants(),
        { kind: 'none' },
        'GET',
      );
      if (!decision.allow) {
        throw new ProblemException(decision.code, decision.status, {
          ...(decision.required === undefined ? {} : { context: { required: decision.required } }),
        });
      }
    }
    return { items: await this.runner.run((tx) => this.reads.list(tx, query)) };
  }

  /** P3.CRS.02 — company master: `booking_cancel_reason.create` at company scope. */
  @Post()
  @Can('booking_cancel_reason.create', { level: 'company' })
  @Audited({ actions: [CANCEL_REASON_CREATE] })
  create(@ZBody(cancelReasonCreateSchema) body: CancelReasonCreate): Promise<CancelReason> {
    return this.runner.run((tx) => this.writes.create(tx, body));
  }
}
