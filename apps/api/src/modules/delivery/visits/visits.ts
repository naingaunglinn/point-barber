import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type RequestLookupDto,
  type StartVisitRequest,
  VisitStatus,
  type VisitDto,
  type WarningDto,
  businessDateOf,
  todayMmt,
} from '@point/shared';

import type { Actor } from '../../../common/access/actor.js';
import { type ReadScope, inReadScope } from '../../../common/access/read-scope.js';
import { Clock } from '../../../common/clock/clock.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { type Tx, TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { DayLock } from '../../cash-closing/index.js';
import { Assignments } from '../../people/index.js';
import { Audit, Idempotency } from '../../platform/index.js';
import { Sales, type SaleViewer } from '../../sales/index.js';
import { type VisitRow, VisitsRepository } from '../repositories/visits.repository.js';
import { VisitView, visitForSale } from './visit-view.js';

// The visit endpoints of the walk-in (P4.VIS.02 – .06 · P4-RULE-02 / 11 · design D4 / D7). Who may call
// them is decided by the guards (design D2); START's read-scope check is here because the branch is in
// the body. Each write is one transaction at READ COMMITTED, locks first, checks after the locks.

/** The audit actions of the visit endpoints (their @Audited lists name the same constants). */
export const VISIT_START = 'visit.start';
export const VISIT_COMPLETE = 'visit.complete';
export const VISIT_INCOMPLETE = 'visit.incomplete';

const blank = (text: string | null | undefined): boolean => (text ?? '').trim() === '';

@Injectable()
export class Visits {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly prisma: PrismaService,
    private readonly idempotency: Idempotency,
    private readonly visits: VisitsRepository,
    private readonly sales: Sales,
    private readonly view: VisitView,
    private readonly dayLock: DayLock,
    private readonly assignments: Assignments,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  /**
   * P4.VIS.03 START (walk-in): the performer is the caller, the location the branch. Through
   * Idempotency.run — a replay answers the stored visit (`replayed`), with no audit row.
   */
  async start(
    viewer: SaleViewer,
    scope: ReadScope,
    body: StartVisitRequest,
    key: string,
  ): Promise<{ replayed: boolean; visit: VisitDto }> {
    const { actor } = viewer;
    if (!inReadScope(scope, body.branch_id))
      throw new ProblemException(ErrorCode.OUT_OF_SCOPE, 403);
    let warnings: WarningDto[] = [];
    const { replayed, row } = await this.runner.run((tx) =>
      this.idempotency.run(tx, {
        key,
        find: () => this.visits.findByClientRequestId(tx, key),
        same: (visit) =>
          visit.started_by_user_id === actor.user_id &&
          visit.branch_id === body.branch_id &&
          visit.booking_id === null &&
          visit.performed_by_employee_id === actor.employee_id,
        create: async () => {
          const now = this.clock.now();
          const date = businessDateOf(now);
          await this.dayLock.assertOpen(tx, body.branch_id, date);
          const assigned = await this.assignments.isActiveAndAssigned(tx, {
            employee_id: actor.employee_id,
            branch_id: body.branch_id,
            date,
          });
          if (!assigned) throw new ProblemException(ErrorCode.NOT_ASSIGNED_TO_BRANCH, 422);
          const unpaid = await this.visits.awaitingPayment(tx, actor.employee_id);
          if (unpaid !== null)
            throw new ProblemException(ErrorCode.UNPAID_VISIT_OPEN, 422, {
              context: { visit_id: unpaid.id },
            });
          const visit = await this.visits.insertWalkIn(tx, {
            id: uuidV7(now.getTime()),
            client_request_id: key,
            branch_id: body.branch_id,
            performed_by_employee_id: actor.employee_id,
            started_by_user_id: actor.user_id,
            started_at: now,
            business_date: date,
          });
          const sale = await this.sales.createOpenForVisit(tx, visit, key);
          warnings = await this.sales.addServiceLines(
            tx,
            sale,
            visitForSale(visit),
            body.items ?? [],
            null,
          );
          await this.audit.emit({
            action: VISIT_START,
            entity_type: 'visits',
            entity_id: visit.id,
            branch_id: visit.branch_id,
            after: {
              sale_id: sale.id,
              business_date: date,
              service_ids: (body.items ?? []).map((item) => item.service_id),
            },
            actor_user_id: actor.user_id,
          });
          return visit;
        },
      }),
    );
    return { replayed, visit: await this.view.of(this.prisma, row, viewer, warnings) };
  }

  /** P4.VIS.05 COMPLETE — at least one active SERVICE line; a repeat changes nothing (P4-RULE-11). */
  async complete(viewer: SaleViewer, visitId: string): Promise<VisitDto> {
    const visit = await this.runner.run(async (tx) => {
      const { visit: locked } = await this.lockSaleThenVisit(tx, visitId);
      if (locked.status === VisitStatus.COMPLETED) {
        this.audit.skip();
        return locked;
      }
      if (locked.status !== VisitStatus.STARTED)
        throw new ProblemException(ErrorCode.INVALID_TRANSITION, 409, {
          context: { status: locked.status },
        });
      const sale = await this.sales.findByVisit(tx, locked.id);
      if (sale === null || !(await this.sales.hasActiveServiceLine(tx, sale.id)))
        throw new ProblemException(ErrorCode.SERVICE_REQUIRED, 422);
      const now = this.clock.now();
      await this.visits.markCompleted(tx, locked.id, now, viewer.actor.user_id);
      await this.audit.emit({
        action: VISIT_COMPLETE,
        entity_type: 'visits',
        entity_id: locked.id,
        branch_id: locked.branch_id,
        before: { status: VisitStatus.STARTED },
        after: { status: VisitStatus.COMPLETED },
        actor_user_id: viewer.actor.user_id,
      });
      return locked;
    });
    return this.read(viewer, visit.id);
  }

  /**
   * P4.VIS.06 INCOMPLETE — from STARTED or COMPLETED with an OPEN sale and no non-voided payment;
   * the sale is CANCELLED, no receipt number is taken and no day lock is taken (P4-RULE-11).
   */
  async incomplete(
    viewer: SaleViewer,
    visitId: string,
    reason: string | null | undefined,
  ): Promise<VisitDto> {
    if (blank(reason)) throw new ProblemException(ErrorCode.REASON_REQUIRED, 400);
    const text = reason as string;
    await this.runner.run(async (tx) => {
      const { visit: locked, saleId } = await this.lockSaleThenVisit(tx, visitId);
      const live = await this.sales.lockPayments(tx, saleId);
      if (locked.status === VisitStatus.INCOMPLETE) {
        this.audit.skip();
        return;
      }
      if (locked.status === VisitStatus.FINISHED)
        throw new ProblemException(ErrorCode.INVALID_TRANSITION, 409, {
          context: { status: locked.status },
        });
      if (live > 0) throw new ProblemException(ErrorCode.PAYMENTS_EXIST, 422);
      const now = this.clock.now();
      await this.visits.markIncomplete(tx, locked.id, now, viewer.actor.user_id, text);
      await this.sales.cancelForVisit(tx, saleId, now);
      await this.audit.emit({
        action: VISIT_INCOMPLETE,
        entity_type: 'visits',
        entity_id: locked.id,
        branch_id: locked.branch_id,
        before: { status: locked.status },
        after: { status: VisitStatus.INCOMPLETE, sale_id: saleId },
        reason: text,
        actor_user_id: viewer.actor.user_id,
      });
    });
    return this.read(viewer, visitId);
  }

  /** P4.VIS.04 — the visit with its sale; 404 when there is none (reads open no transaction). */
  async read(viewer: SaleViewer, visitId: string): Promise<VisitDto> {
    const visit = await this.visits.find(this.prisma, visitId);
    if (visit === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    return this.view.of(this.prisma, visit, viewer);
  }

  /** P4.VIS.02 — the caller's visits (performer or recorder). */
  async mine(
    viewer: SaleViewer,
    filter: { readonly statuses?: readonly number[]; readonly date?: string },
  ): Promise<{ items: VisitDto[] }> {
    const rows = await this.visits.mine(this.prisma, viewer.actor, {
      ...filter,
      today: todayMmt(this.clock.now()),
    });
    const items: VisitDto[] = [];
    for (const row of rows) items.push(await this.view.of(this.prisma, row, viewer));
    return { items };
  }

  /**
   * P4.REQ.01 — what the caller saved under a client request id (design D7): a visit (with its sale);
   * null when nothing was saved or another user saved it.
   */
  async lookupRequest(userId: string, key: string): Promise<RequestLookupDto | null> {
    const visit = await this.visits.findByClientRequestId(this.prisma, key);
    if (visit !== null && visit.started_by_user_id === userId) {
      const sale = await this.sales.findByVisit(this.prisma, visit.id);
      return {
        client_request_id: key,
        resource_type: 'visit',
        id: visit.id,
        sale_id: sale?.id ?? null,
        visit_id: null,
      };
    }
    return null;
  }

  /** The row of the visit by id without a lock, then sale FOR UPDATE → visit FOR UPDATE (design D4). */
  private async lockSaleThenVisit(
    tx: Tx,
    visitId: string,
  ): Promise<{ visit: VisitRow; saleId: string }> {
    const sale = await this.sales.findByVisit(tx, visitId);
    if (sale === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    await this.sales.lockForUpdate(tx, sale.id);
    const visit = await this.visits.lockForUpdate(tx, visitId);
    if (visit === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    return { visit, saleId: sale.id };
  }
}
