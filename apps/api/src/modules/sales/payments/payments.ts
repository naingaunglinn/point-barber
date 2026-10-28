import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type Mmk,
  type PaymentCreate,
  type PaymentMethodDto,
  PaymentMethodStatus,
  type SaleDto,
  SaleStatus,
  businessDateOf,
  moneyFromWire,
  moneyToWire,
  toMmtIso,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { type Tx, TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { DayLock } from '../../cash-closing/index.js';
import { Assignments } from '../../people/index.js';
import { Audit, Idempotency } from '../../platform/index.js';
import { Sales, assertSaleOpen } from '../lines/sales.js';
import { VisitsRegistry } from '../ports/visits-registry.js';
import {
  type PaymentMethodListRow,
  PaymentMethodsRepository,
} from '../repositories/payment-methods.repository.js';
import { PaymentsRepository } from '../repositories/payments.repository.js';
import { type SaleViewer, SaleView } from '../view/sale-view.js';

// Payments on an OPEN sale (P4.PAY.02 / .03 · P4.PMT.01 · P4-RULE-09 · D-PAY-01 / 02 · design D4 / D7).
// Add: through Idempotency.run, locks in the one order — day lock → sale → payments → the reference
// lock — and every check after them. Void: the row is kept (D-DAT-05). Who may call them is decided by
// the guard (sale.finish_override or the checkout actors — design D2).

/** The audit actions of the payment endpoints (their @Audited lists name the same constants). */
export const PAYMENT_ADD = 'payment.add';
export const PAYMENT_VOID = 'payment.void';

/** The two system methods of the base seed (P4-RULE-19). */
const SYSTEM_CODES = new Set(['CASH', 'KBZPAY']);

const blank = (text: string | null | undefined): boolean => (text ?? '').trim() === '';

export function toPaymentMethodDto(row: PaymentMethodListRow): PaymentMethodDto {
  return {
    id: row.id,
    code: row.code,
    name_mm: row.name_mm,
    name_en: row.name_en,
    kind: row.kind as PaymentMethodDto['kind'],
    is_cash: row.is_cash,
    requires_reference: row.requires_reference,
    requires_verification: row.requires_verification,
    reference_regex: row.reference_regex,
    is_system: SYSTEM_CODES.has(row.code),
    sort_order: row.sort_order,
    status: row.status as PaymentMethodDto['status'],
    archived_at: row.archived_at === null ? null : toMmtIso(row.archived_at),
    updated_at: toMmtIso(row.updated_at),
  };
}

@Injectable()
export class Payments {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly prisma: PrismaService,
    private readonly idempotency: Idempotency,
    private readonly methods: PaymentMethodsRepository,
    private readonly payments: PaymentsRepository,
    private readonly sales: Sales,
    private readonly view: SaleView,
    private readonly registry: VisitsRegistry,
    private readonly dayLock: DayLock,
    private readonly assignments: Assignments,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  /** P4.PMT.01 — ACTIVE methods in sort_order, any staff member (Cash first — AD-POS-08). */
  async activeMethods(): Promise<{ items: PaymentMethodDto[] }> {
    return { items: (await this.methods.active(this.prisma)).map(toPaymentMethodDto) };
  }

  /** P4.PAY.02 — 201 Sale; a replay (same key, same fields) answers the current Sale. */
  async add(
    viewer: SaleViewer,
    saleId: string,
    body: PaymentCreate,
    key: string,
  ): Promise<{ replayed: boolean; sale: SaleDto }> {
    const { actor } = viewer;
    const amount = moneyFromWire(body.amount);
    const { replayed } = await this.runner.run((tx) =>
      this.idempotency.run(tx, {
        key,
        find: () => this.payments.findByClientRequestId(tx, key),
        same: (payment) =>
          payment.recorded_by_user_id === actor.user_id &&
          payment.sale_id === saleId &&
          payment.payment_method_id === body.payment_method_id &&
          payment.amount === amount,
        create: () => this.create(tx, viewer, saleId, body, key),
      }),
    );
    return { replayed, sale: await this.saleOf(viewer, saleId) };
  }

  private async create(
    tx: Tx,
    viewer: SaleViewer,
    saleId: string,
    body: PaymentCreate,
    key: string,
  ) {
    const { actor } = viewer;
    const now = this.clock.now();
    const today = businessDateOf(now);
    // The branch is learnt without a lock; the day lock is the first lock (design D4).
    const unlocked = await this.sales.find(tx, saleId);
    if (unlocked === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    await this.dayLock.assertOpen(tx, unlocked.branch_id, today);
    const sale = await this.sales.lockForUpdate(tx, saleId);
    assertSaleOpen(sale, null);
    await this.payments.lockOfSale(tx, sale.id);

    const method = await this.methods.find(tx, body.payment_method_id);
    if (method?.status !== PaymentMethodStatus.ACTIVE || method.archived_at !== null)
      throw new ProblemException(ErrorCode.METHOD_INACTIVE, 422);

    // Reference (P4-RULE-09): trimmed first; required, then the method's format; one per method.
    const reference = blank(body.external_reference)
      ? null
      : (body.external_reference as string).trim();
    if (method.requires_reference && reference === null)
      throw new ProblemException(ErrorCode.REFERENCE_REQUIRED, 422);
    if (
      reference !== null &&
      method.reference_regex !== null &&
      !new RegExp(method.reference_regex).test(reference)
    )
      throw new ProblemException(ErrorCode.REFERENCE_FORMAT, 422);
    if (reference !== null) {
      await this.payments.lockReference(tx, method.id, reference);
      const holder = await this.payments.referenceHolder(tx, method.id, reference);
      if (holder !== null)
        throw new ProblemException(ErrorCode.DUPLICATE_REFERENCE, 409, {
          context: {
            receipt_number:
              holder.sale_status === SaleStatus.FINISHED ? holder.receipt_number : null,
          },
        });
    }

    // Collected by: the performer unless named; a named one ACTIVE and assigned to the branch today.
    const visit =
      sale.visit_id === null ? null : await this.registry.visits.read(tx, sale.visit_id);
    if (visit === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    const collector = body.collected_by_employee_id ?? visit.performed_by_employee_id;
    if (body.collected_by_employee_id !== undefined && body.collected_by_employee_id !== null) {
      const assigned = await this.assignments.isActiveAndAssigned(tx, {
        employee_id: collector,
        branch_id: sale.branch_id,
        date: today,
      });
      if (!assigned) throw new ProblemException(ErrorCode.NOT_ASSIGNED_TO_BRANCH, 422);
    }

    // A cash payment never exceeds what remains (non-cash may — owner B5).
    const amount = moneyFromWire(body.amount);
    if (method.is_cash) {
      const totals = await this.sales.totalsOf(tx, sale.id);
      if (amount > totals.remaining)
        throw new ProblemException(ErrorCode.AMOUNT_EXCEEDS_REMAINING, 422);
    }

    const id = uuidV7(now.getTime());
    await this.payments.insert(tx, {
      id,
      client_request_id: key,
      sale_id: sale.id,
      payment_method_id: method.id,
      amount,
      external_reference: reference,
      collected_by_employee_id: collector,
      received_at: now,
      recorded_by_user_id: actor.user_id,
    });
    await this.sales.recomputeTotals(tx, sale.id);
    await this.audit.emit({
      action: PAYMENT_ADD,
      entity_type: 'sales',
      entity_id: sale.id,
      branch_id: sale.branch_id,
      after: {
        payment_id: id,
        method: method.code,
        amount: moneyToWire(amount as Mmk),
        external_reference: reference,
        collected_by_employee_id: collector,
      },
      actor_user_id: actor.user_id,
    });
    return {
      id,
      sale_id: sale.id,
      payment_method_id: method.id,
      amount,
      recorded_by_user_id: actor.user_id,
    };
  }

  /**
   * P4.PAY.03 — void with a reason while the sale is OPEN (FINISHED → 409 with `refund`); the row is
   * kept and stops counting. Voiding a voided payment changes nothing (200, no audit row).
   */
  async void(
    viewer: SaleViewer,
    paymentId: string,
    reason: string | null | undefined,
  ): Promise<SaleDto> {
    if (blank(reason)) throw new ProblemException(ErrorCode.REASON_REQUIRED, 400);
    const text = reason as string;
    const saleId = await this.runner.run(async (tx) => {
      const payment = await this.payments.find(tx, paymentId);
      if (payment === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
      const unlocked = await this.sales.find(tx, payment.sale_id);
      if (unlocked === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
      await this.dayLock.assertOpen(tx, unlocked.branch_id, businessDateOf(this.clock.now()));
      const sale = await this.sales.lockForUpdate(tx, payment.sale_id);
      assertSaleOpen(sale, 'refund');
      await this.payments.lockOne(tx, payment.id);
      const current = await this.payments.find(tx, payment.id);
      if (current?.voided_at !== null) {
        this.audit.skip();
        return sale.id;
      }
      await this.payments.markVoided(tx, payment.id, {
        at: this.clock.now(),
        by_user_id: viewer.actor.user_id,
        reason: text,
      });
      await this.sales.recomputeTotals(tx, sale.id);
      await this.audit.emit({
        action: PAYMENT_VOID,
        entity_type: 'sales',
        entity_id: sale.id,
        branch_id: sale.branch_id,
        before: { payment_id: payment.id },
        reason: text,
        actor_user_id: viewer.actor.user_id,
      });
      return sale.id;
    });
    return this.saleOf(viewer, saleId);
  }

  /** P4.REQ.01 — the payment the caller saved under a key, with its sale and visit. */
  async createdBy(
    userId: string,
    key: string,
  ): Promise<{ id: string; sale_id: string; visit_id: string | null } | null> {
    const payment = await this.payments.findByClientRequestId(this.prisma, key);
    if (payment?.recorded_by_user_id !== userId) return null;
    const sale = await this.sales.find(this.prisma, payment.sale_id);
    return { id: payment.id, sale_id: payment.sale_id, visit_id: sale?.visit_id ?? null };
  }

  private async saleOf(viewer: SaleViewer, saleId: string): Promise<SaleDto> {
    const sale = await this.view.build(this.prisma, saleId, viewer);
    if (sale === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    return sale;
  }
}
