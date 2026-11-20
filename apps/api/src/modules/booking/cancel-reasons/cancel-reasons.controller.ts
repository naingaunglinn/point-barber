import { Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import {
  type CancelReason,
  type CancelReasonCreate,
  type CancelReasonList,
  type CancelReasonListQuery,
  type CancelReasonOrder,
  type CancelReasonUpdate,
  cancelReasonCreateSchema,
  cancelReasonListQuerySchema,
  cancelReasonOrderSchema,
  cancelReasonUpdateSchema,
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
import {
  CANCEL_REASON_ARCHIVE,
  CANCEL_REASON_CREATE,
  CANCEL_REASON_REORDER,
  CANCEL_REASON_UPDATE,
  CancelReasonWrites,
} from './cancel-reason-writes.js';

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

  /** P3.CRS.05 — `booking_cancel_reason.update` at company scope; registered before `…/:id` (D2). */
  @Put('order')
  @Can('booking_cancel_reason.update', { level: 'company' })
  @Audited({ actions: [CANCEL_REASON_REORDER] })
  async reorder(
    @ZBody(cancelReasonOrderSchema) body: CancelReasonOrder,
  ): Promise<CancelReasonList> {
    return { items: await this.runner.run((tx) => this.writes.reorder(tx, body)) };
  }

  /** P3.CRS.03 — company master: `booking_cancel_reason.update` at company scope. */
  @Patch(':id')
  @Can('booking_cancel_reason.update', { level: 'company' })
  @Audited({ actions: [CANCEL_REASON_UPDATE] })
  update(
    @Param('id') id: string,
    @ZBody(cancelReasonUpdateSchema) body: CancelReasonUpdate,
  ): Promise<CancelReason> {
    return this.runner.run((tx) => this.writes.update(tx, id, body));
  }

  /** P3.CRS.04 — company master: `booking_cancel_reason.delete` at company scope; 200, not 201. */
  @Post(':id/archive')
  @HttpCode(200)
  @Can('booking_cancel_reason.delete', { level: 'company' })
  @Audited({ actions: [CANCEL_REASON_ARCHIVE] })
  archive(@Param('id') id: string): Promise<CancelReason> {
    return this.runner.run((tx) => this.writes.archive(tx, id));
  }
}
