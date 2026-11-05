import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  LocationType,
  type Mmk,
  SaleItemLineType,
  SaleStatus,
  type WarningDto,
} from '@point/shared';

import type { Actor } from '../../../common/access/actor.js';
import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Eligibility, PriceQuote } from '../../catalog/index.js';
import type { VisitForSale } from '../ports/visits-port.js';
import { PaymentsRepository } from '../repositories/payments.repository.js';
import { SaleItemsRepository } from '../repositories/sale-items.repository.js';
import { type SaleRow, SalesRepository } from '../repositories/sales.repository.js';
import { type SaleTotals, computeSaleTotals } from '../totals/sale-totals.js';

// The sale side of a visit (add-walkin-visit-checkout design D1 / D4): the OPEN sale START creates, its
// service lines priced by the quote and snapshotted (P4-RULE-04 / 05 · D-SVC-04 / 08), the totals rule
// persisted under the sale lock, and the cancel of INCOMPLETE. Every method runs inside the caller's
// transaction; refusals are thrown, so the transaction keeps nothing.

/** The audit actions of the line endpoints (their @Audited lists name the same constants). */
export const SALE_ITEM_ADD = 'sale.item_add';
export const SALE_ITEM_REMOVE = 'sale.item_remove';

@Injectable()
export class Sales {
  constructor(
    private readonly sales: SalesRepository,
    private readonly items: SaleItemsRepository,
    private readonly payments: PaymentsRepository,
    private readonly quotes: PriceQuote,
    private readonly eligibility: Eligibility,
    private readonly clock: Clock,
  ) {}

  /** The OPEN sale of a new visit, carrying the visit's client_request_id (API-IDEM-02). */
  createOpenForVisit(
    tx: Tx,
    visit: { readonly id: string; readonly branch_id: string },
    key: string,
  ): Promise<SaleRow> {
    const now = this.clock.now();
    return this.sales.insertOpen(tx, {
      id: uuidV7(now.getTime()),
      client_request_id: key,
      branch_id: visit.branch_id,
      visit_id: visit.id,
      at: now,
    });
  }

  /** The sale, locked FOR UPDATE; 404 not_found when there is none. */
  async lockForUpdate(tx: Tx, saleId: string): Promise<SaleRow> {
    const sale = await this.sales.lockForUpdate(tx, saleId);
    if (sale === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    return sale;
  }

  find(db: Tx, saleId: string): Promise<SaleRow | null> {
    return this.sales.find(db, saleId);
  }

  findByVisit(db: Tx, visitId: string): Promise<SaleRow | null> {
    return this.sales.findByVisit(db, visitId);
  }

  /** INCOMPLETE: the sale becomes 0 CANCELLED; no receipt number is taken (P4-RULE-11). */
  async cancelForVisit(tx: Tx, saleId: string, at: Date): Promise<void> {
    await this.sales.cancel(tx, saleId, at);
  }

  /**
   * One SERVICE line per item, priced by the quote for (the sale's branch, BRANCH, the visit performer,
   * the visit business date): list = unit price, quantity 1, the names snapshotted. An item the quote
   * cannot sell refuses the whole request with its reason (422). A service outside the performer's
   * eligibility is recorded anyway, with the warning `not_eligible` (P2-RULE-06). Totals after.
   */
  async addServiceLines(
    tx: Tx,
    sale: SaleRow,
    visit: VisitForSale,
    items: readonly { readonly service_id: string }[],
    addedReason: string | null,
  ): Promise<WarningDto[]> {
    if (items.length === 0) return [];
    const quote = await this.quotes.quote(tx, {
      branch_id: sale.branch_id,
      location_type: LocationType.BRANCH,
      date: visit.business_date,
      employee_id: visit.performed_by_employee_id,
      items,
    });
    const refused = quote.items.find((item) => !item.sold);
    if (refused?.reason !== undefined && refused.reason !== null) {
      throw new ProblemException(refused.reason, 422);
    }
    const warnings: WarningDto[] = [];
    const now = this.clock.now();
    for (const item of quote.items) {
      await this.items.insertServiceLine(tx, {
        id: uuidV7(now.getTime()),
        sale_id: sale.id,
        service_id: item.service_id,
        performed_by_employee_id: visit.performed_by_employee_id,
        description_mm: item.name_mm ?? '',
        description_en: item.name_en,
        price_amount: item.unit_price as Mmk,
        added_reason: addedReason,
        at: now,
      });
      const eligible = await this.eligibility.isEligible(tx, {
        employee_id: visit.performed_by_employee_id,
        branch_id: sale.branch_id,
        service_id: item.service_id,
        date: visit.business_date,
      });
      if (!eligible)
        warnings.push({ code: 'not_eligible', params: { service_id: item.service_id } });
    }
    await this.recomputeTotals(tx, sale.id);
    return warnings;
  }

  /** Marks a line removed (the row stays — D-DAT-05) and recomputes the totals. */
  async removeLine(
    tx: Tx,
    saleId: string,
    itemId: string,
    removal: { readonly actor: Actor; readonly reason: string },
  ): Promise<void> {
    await this.items.markRemoved(tx, itemId, {
      at: this.clock.now(),
      by_user_id: removal.actor.user_id,
      reason: removal.reason,
    });
    await this.recomputeTotals(tx, saleId);
  }

  /** INCOMPLETE (design D4 step 3): locks the sale's payments; the number that are not voided. */
  async lockPayments(tx: Tx, saleId: string): Promise<number> {
    await this.payments.lockOfSale(tx, saleId);
    const rows = await this.payments.ofSale(tx, saleId);
    return rows.filter((payment) => payment.voided_at === null).length;
  }

  /** The received times of the sale's payments that are not voided (the late-entry order check). */
  async receivedAts(db: Tx, saleId: string): Promise<Date[]> {
    const rows = await this.payments.ofSale(db, saleId);
    return rows
      .filter((payment) => payment.voided_at === null)
      .map((payment) => payment.received_at);
  }

  async hasActiveServiceLine(db: Tx, saleId: string): Promise<boolean> {
    const lines = await this.items.ofSale(db, saleId);
    return lines.some(
      (line) => line.line_type === SaleItemLineType.SERVICE && line.removed_at === null,
    );
  }

  lines(db: Tx, saleId: string) {
    return this.items.ofSale(db, saleId);
  }

  /** The totals rule over the lines and payments, stored on the sale (design D8 · sales_amounts_chk). */
  async recomputeTotals(tx: Tx, saleId: string): Promise<SaleTotals> {
    const totals = await this.totalsOf(tx, saleId);
    await this.sales.writeTotals(tx, saleId, totals, this.clock.now());
    return totals;
  }

  async totalsOf(db: Tx, saleId: string): Promise<SaleTotals> {
    const [lines, payments] = await Promise.all([
      this.items.ofSale(db, saleId),
      this.payments.ofSale(db, saleId),
    ]);
    return computeSaleTotals(
      lines.map((line) => ({
        unit_price: line.unit_price_amount as Mmk,
        quantity: line.quantity,
        removed: line.removed_at !== null,
      })),
      payments.map((payment) => ({
        amount: payment.amount as Mmk,
        is_cash: payment.method.is_cash,
        voided: payment.voided_at !== null,
      })),
    );
  }
}

/**
 * A write on a sale that is not OPEN (P4-RULE-01 v1.1 · design D9): FINISHED → 409 invalid_transition
 * with the correction path of the write; CANCELLED → 409 with no path.
 */
export function assertSaleOpen(
  sale: SaleRow,
  correctionPath: 'difference_sale' | 'refund' | null,
): void {
  if (sale.status === SaleStatus.OPEN) return;
  const context: Record<string, unknown> = { status: sale.status };
  if (sale.status === SaleStatus.FINISHED && correctionPath !== null)
    context.correction_path = correctionPath;
  throw new ProblemException(ErrorCode.INVALID_TRANSITION, 409, { context });
}
