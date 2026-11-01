import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type Mmk,
  type SaleItemCreate,
  SaleItemLineType,
  VisitStatus,
  type WarningDto,
  moneyToWire,
} from '@point/shared';

import type { Actor } from '../../../common/access/actor.js';
import { type Tx, TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { Audit } from '../../platform/index.js';
import type { VisitForSale } from '../ports/visits-port.js';
import { VisitsRegistry } from '../ports/visits-registry.js';
import { SALE_ITEM_ADD, SALE_ITEM_REMOVE, Sales, assertSaleOpen } from './sales.js';

// The line endpoints (P4.SAL.04 add · P4.SAL.06 remove — design D4: lock the sale, check the state,
// read the visit, write, totals). Who may call them is decided by the guard (visit.update or the line
// actors — design D2). A reason is blank when it holds only spaces (API-DATA-11 → 400 reason_required).

const blank = (text: string | null | undefined): boolean => (text ?? '').trim() === '';

@Injectable()
export class SaleLines {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly sales: Sales,
    private readonly audit: Audit,
    private readonly registry: VisitsRegistry,
  ) {}

  private async visitOf(tx: Tx, visitId: string | null): Promise<VisitForSale> {
    const visit = visitId === null ? null : await this.registry.visits.read(tx, visitId);
    if (visit === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    return visit;
  }

  /** P4.SAL.04 — a line after COMPLETE needs `added_reason` (D-VIS-05). */
  add(
    actor: Actor,
    saleId: string,
    body: SaleItemCreate,
  ): Promise<{ sale_id: string; warnings: WarningDto[] }> {
    return this.runner.run(async (tx) => {
      const sale = await this.sales.lockForUpdate(tx, saleId);
      assertSaleOpen(sale, 'difference_sale');
      const visit = await this.visitOf(tx, sale.visit_id);
      const afterComplete = visit.status === VisitStatus.COMPLETED;
      if (afterComplete && blank(body.added_reason))
        throw new ProblemException(ErrorCode.REASON_REQUIRED, 400);
      const addedReason = blank(body.added_reason) ? null : (body.added_reason ?? null);
      const warnings = await this.sales.addServiceLines(
        tx,
        sale,
        visit,
        [{ service_id: body.service_id }],
        addedReason,
      );
      await this.audit.emit({
        action: SALE_ITEM_ADD,
        entity_type: 'sales',
        entity_id: sale.id,
        branch_id: sale.branch_id,
        after: { service_id: body.service_id, added_reason: addedReason },
        actor_user_id: actor.user_id,
      });
      return { sale_id: sale.id, warnings };
    });
  }

  /**
   * P4.SAL.06 — the row is kept with removed_at / by / reason (D-DAT-05); the last active SERVICE
   * line of a COMPLETED visit cannot go (422 service_required). Removing a removed line changes
   * nothing (200, no audit row).
   */
  remove(
    actor: Actor,
    saleId: string,
    itemId: string,
    reason: string | null | undefined,
  ): Promise<{ sale_id: string }> {
    if (blank(reason)) throw new ProblemException(ErrorCode.REASON_REQUIRED, 400);
    const text = reason as string;
    return this.runner.run(async (tx) => {
      const sale = await this.sales.lockForUpdate(tx, saleId);
      assertSaleOpen(sale, 'refund');
      const lines = await this.sales.lines(tx, sale.id);
      const line = lines.find((item) => item.id === itemId);
      if (line === undefined) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
      if (line.removed_at !== null) {
        this.audit.skip();
        return { sale_id: sale.id };
      }
      const visit = await this.visitOf(tx, sale.visit_id);
      const otherServices = lines.filter(
        (item) =>
          item.id !== line.id &&
          item.line_type === SaleItemLineType.SERVICE &&
          item.removed_at === null,
      );
      if (
        visit.status === VisitStatus.COMPLETED &&
        line.line_type === SaleItemLineType.SERVICE &&
        otherServices.length === 0
      )
        throw new ProblemException(ErrorCode.SERVICE_REQUIRED, 422);
      await this.sales.removeLine(tx, sale.id, line.id, { actor, reason: text });
      await this.audit.emit({
        action: SALE_ITEM_REMOVE,
        entity_type: 'sales',
        entity_id: sale.id,
        branch_id: sale.branch_id,
        before: { item_id: line.id, unit_price_amount: moneyToWire(line.unit_price_amount as Mmk) },
        reason: text,
        actor_user_id: actor.user_id,
      });
      return { sale_id: sale.id };
    });
  }
}
