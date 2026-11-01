import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type FinishRequest,
  type Mmk,
  ReceiptCounterKind,
  RefundKind,
  SaleItemLineType,
  type SaleDto,
  SaleStatus,
  VisitStatus,
  type WarningDto,
  businessDateOf,
  moneyFromWire,
  moneyToWire,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Customers } from '../../booking/index.js';
import { DayLock } from '../../cash-closing/index.js';
import { PayrollLock } from '../../payroll/index.js';
import { Audit, Jobs } from '../../platform/index.js';
import { Sales } from '../lines/sales.js';
import { VisitsRegistry } from '../ports/visits-registry.js';
import { RECEIPT_RENDER, type ReceiptRenderData } from '../receipts/receipt-render.job.js';
import { PaymentMethodsRepository } from '../repositories/payment-methods.repository.js';
import { RefundsRepository } from '../repositories/refunds.repository.js';
import { SalesRepository } from '../repositories/sales.repository.js';
import { type SaleViewer, SaleView } from '../view/sale-view.js';
import { ReceiptNumbers } from './receipt-numbers.js';

// FINISH (P4.SAL.10 · P4-RULE-10 · add-walkin-visit-checkout design D5): one transaction whose numbered
// steps are the lock order — day lock, payroll lock, sale, visit, customer, payments, receipt counter.
// Idempotent by state: a FINISHED sale answers its current state with no lock, no number and no audit
// row. The steps of later changes (discounts 8–9, stock 16, realtime 18) are not here.

/** The audit action of FINISH (its @Audited list names it, with the customer actions of step 10). */
export const SALE_FINISH = 'sale.finish';
/** The reason of the automatic change return (payments spec — owner B5). */
export const CHANGE_RETURN_REASON = 'Change returned for over-transfer';

const blank = (text: string | null | undefined): boolean => (text ?? '').trim() === '';
const wire = (amount: bigint): number => moneyToWire(amount as Mmk);

@Injectable()
export class SalesFinish {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly prisma: PrismaService,
    private readonly sales: Sales,
    private readonly salesRows: SalesRepository,
    private readonly refunds: RefundsRepository,
    private readonly methods: PaymentMethodsRepository,
    private readonly numbers: ReceiptNumbers,
    private readonly customers: Customers,
    private readonly registry: VisitsRegistry,
    private readonly dayLock: DayLock,
    private readonly payrollLock: PayrollLock,
    private readonly jobs: Jobs,
    private readonly audit: Audit,
    private readonly view: SaleView,
    private readonly clock: Clock,
  ) {}

  async finish(viewer: SaleViewer, saleId: string, body: FinishRequest): Promise<SaleDto> {
    const { actor } = viewer;
    let warnings: WarningDto[] = [];
    await this.runner.run(async (tx) => {
      // 1. Read without a lock: FINISHED → the current state; CANCELLED → 409.
      const read = await this.salesRows.find(tx, saleId);
      if (read === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
      if (read.status === SaleStatus.FINISHED) {
        this.audit.skip();
        return;
      }
      if (read.status === SaleStatus.CANCELLED)
        throw new ProblemException(ErrorCode.INVALID_TRANSITION, 409, {
          context: { status: SaleStatus.CANCELLED },
        });
      const finishedAt = this.clock.now();
      const businessDate = businessDateOf(finishedAt);

      // 2. Day lock of the sale's business date (a visit crossing midnight checks the new day).
      await this.dayLock.assertOpen(tx, read.branch_id, businessDate);
      // 3. Payroll lock for a sale with SERVICE lines.
      const performers = (await this.sales.lines(tx, read.id))
        .filter((line) => line.line_type === SaleItemLineType.SERVICE && line.removed_at === null)
        .map((line) => line.performed_by_employee_id)
        .filter((id): id is string => id !== null);
      if (performers.length > 0)
        await this.payrollLock.assertNotFinalized(tx, {
          employee_ids: [...new Set(performers)],
          dates: [businessDate],
        });
      // 4. Sale FOR UPDATE; the state again (two FINISH at once: the second sees FINISHED).
      const sale = await this.sales.lockForUpdate(tx, read.id);
      if (sale.status === SaleStatus.FINISHED) {
        this.audit.skip();
        return;
      }
      if (sale.status === SaleStatus.CANCELLED)
        throw new ProblemException(ErrorCode.INVALID_TRANSITION, 409, {
          context: { status: SaleStatus.CANCELLED },
        });
      // 5. Visit FOR UPDATE through the port.
      if (sale.visit_id === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
      const visit = await this.registry.visits.lockForUpdate(tx, sale.visit_id);
      // 6. A checkout actor, or the override holder with a reason (the guard let the caller in).
      const override = visit.performed_by_employee_id !== actor.employee_id;
      if (override && blank(body.override_reason))
        throw new ProblemException(ErrorCode.REASON_REQUIRED, 400);
      // 7. The visit must be COMPLETED.
      if (visit.status !== VisitStatus.COMPLETED)
        throw new ProblemException(ErrorCode.VISIT_NOT_COMPLETED, 422);
      // 10. Customer: match or create by phone; none when omitted (Skip).
      let customerId: string | null = null;
      if (body.customer !== undefined && body.customer !== null) {
        const match = await this.customers.matchOrCreate(tx, {
          phone: body.customer.phone,
          name: body.customer.name,
          actor_user_id: actor.user_id,
        });
        customerId = match.customer.id;
        warnings = [...match.warnings];
      }
      // 11. Totals under the sale lock; the total the screen showed must still hold.
      const totals = await this.sales.recomputeTotals(tx, sale.id);
      if (moneyFromWire(body.expected_total_amount) !== totals.total)
        throw new ProblemException(ErrorCode.TOTAL_CHANGED, 409, {
          context: { total_amount: wire(totals.total) },
        });
      // 12. Payments FOR UPDATE; full payment, and an excess only up to the non-cash payments.
      await this.sales.lockPayments(tx, sale.id);
      if (!totals.finish_allowed)
        throw new ProblemException(ErrorCode.AMOUNT_MISMATCH, 422, {
          context: { remaining_amount: wire(totals.remaining) },
        });
      // 13. The receipt number — the counter row is locked until commit.
      const receipt = await this.numbers.next(
        tx,
        sale.branch_id,
        ReceiptCounterKind.SALE,
        businessDate,
      );
      // 14. Status updates: the sale, then the visit (lines and totals were written before).
      await this.salesRows.finish(tx, sale.id, {
        at: finishedAt,
        by_user_id: actor.user_id,
        business_date: businessDate,
        receipt,
        customer_id: customerId,
      });
      await this.registry.visits.markFinished(tx, visit.id, finishedAt);
      // 15. The change of a non-cash over-transfer, returned in cash (owner B5 · D-PAY-05).
      let refundId: string | null = null;
      let refundNumber: string | null = null;
      if (totals.change_due > 0n) {
        const cash = await this.methods.byCode(tx, 'CASH');
        if (cash === null) throw new Error('the base seed has no CASH method');
        const rf = await this.numbers.next(
          tx,
          sale.branch_id,
          ReceiptCounterKind.REFUND,
          businessDate,
        );
        refundId = uuidV7(finishedAt.getTime());
        refundNumber = rf.number;
        await this.refunds.insert(tx, {
          id: refundId,
          client_request_id: uuidV7(finishedAt.getTime()),
          sale_id: sale.id,
          branch_id: sale.branch_id,
          kind: RefundKind.OVERPAYMENT_RETURN,
          payment_method_id: cash.id,
          amount: totals.change_due,
          reason: CHANGE_RETURN_REASON,
          receipt: rf,
          business_date: businessDate,
          refunded_at: finishedAt,
          refunded_by_user_id: actor.user_id,
        });
      }
      // 17. The render jobs and the audit row, inside the transaction (none survive a rollback).
      await this.jobs.send<ReceiptRenderData>(tx, RECEIPT_RENDER, {
        entity_type: 'sales',
        entity_id: sale.id,
      });
      if (refundId !== null)
        await this.jobs.send<ReceiptRenderData>(tx, RECEIPT_RENDER, {
          entity_type: 'refunds',
          entity_id: refundId,
        });
      await this.audit.emit({
        action: SALE_FINISH,
        entity_type: 'sales',
        entity_id: sale.id,
        branch_id: sale.branch_id,
        after: {
          receipt_number: receipt.number,
          business_date: businessDate,
          total_amount: wire(totals.total),
          paid_amount: wire(totals.paid),
          customer_id: customerId,
          change_refund_number: refundNumber,
        },
        reason: override ? (body.override_reason ?? null) : null,
        actor_user_id: actor.user_id,
      });
    });
    const sale = await this.view.build(this.prisma, saleId, viewer, warnings);
    if (sale === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    return sale;
  }
}
