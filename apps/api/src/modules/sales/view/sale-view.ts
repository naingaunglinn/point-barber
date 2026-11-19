import { Injectable } from '@nestjs/common';
import {
  type PermissionCode,
  type Mmk,
  type PaymentDto,
  RefundKind,
  type SaleDto,
  type SaleItemDto,
  type WarningDto,
  moneyToWire,
  sumMoney,
  toMmtIso,
} from '@point/shared';

import type { Actor } from '../../../common/access/actor.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { Customers } from '../../booking/index.js';
import { DisplayNames } from '../../people/index.js';
import { type ActionRights, saleActions } from '../actions/sale-actions.js';
import type { VisitForSale } from '../ports/visits-port.js';
import { VisitsRegistry } from '../ports/visits-registry.js';
import { type PaymentRow, PaymentsRepository } from '../repositories/payments.repository.js';
import { RefundsRepository } from '../repositories/refunds.repository.js';
import { type ItemRow, SaleItemsRepository } from '../repositories/sale-items.repository.js';
import { type SaleRow, SalesRepository } from '../repositories/sales.repository.js';
import { computeSaleTotals } from '../totals/sale-totals.js';

// The one Sale mapper (P4.SAL.02 `Sale` · API-ERR-03 · API-DATA-02): every member named, amounts through
// moneyToWire, instants through toMmtIso, people by display name in the caller's language (one lookup
// for the users and one for the employees of a response). paid / remaining / change come from the
// totals rule; the stored totals are the rule's last result. The members of later changes are null
// or empty (commission_estimate, discount, pending_discount_request, adjustments, difference_of).

export interface SaleViewer {
  readonly actor: Actor;
  /** The codes that let the caller act on someone else's sale, at that sale's branch. */
  rightsAt(branchId: string): ActionRights;
  /** A code the caller holds at that branch — the handler policy of a body member (API-PERM-02). */
  can(code: PermissionCode, branchId: string): boolean;
}

const wire = (amount: bigint): number => moneyToWire(amount as Mmk);
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
const instant = (date: Date | null): string | null => (date === null ? null : toMmtIso(date));

@Injectable()
export class SaleView {
  constructor(
    private readonly sales: SalesRepository,
    private readonly items: SaleItemsRepository,
    private readonly payments: PaymentsRepository,
    private readonly refunds: RefundsRepository,
    private readonly customers: Customers,
    private readonly names: DisplayNames,
    private readonly registry: VisitsRegistry,
  ) {}

  async build(
    db: Tx,
    saleId: string,
    viewer: SaleViewer,
    warnings: readonly WarningDto[] = [],
  ): Promise<SaleDto | null> {
    const sale = await this.sales.find(db, saleId);
    if (sale === null) return null;
    const visit =
      sale.visit_id === null ? null : await this.registry.visits.read(db, sale.visit_id);
    return this.of(db, sale, visit, viewer, warnings);
  }

  async of(
    db: Tx,
    sale: SaleRow,
    visit: VisitForSale | null,
    viewer: SaleViewer,
    warnings: readonly WarningDto[] = [],
  ): Promise<SaleDto> {
    const [items, payments, refunds] = await Promise.all([
      this.items.ofSale(db, sale.id),
      this.payments.ofSale(db, sale.id),
      this.refunds.ofSale(db, sale.id),
    ]);
    const locale = await this.names.callerLocale();
    const userIds = [
      sale.finished_by_user_id,
      ...items.flatMap((item) => [item.price_override_by_user_id, item.removed_by_user_id]),
      ...payments.flatMap((p) => [
        p.recorded_by_user_id,
        p.verified_by_user_id,
        p.voided_by_user_id,
      ]),
    ].filter((id): id is string => id !== null);
    const employeeIds = [
      ...items.map((item) => item.performed_by_employee_id),
      ...payments.map((payment) => payment.collected_by_employee_id),
    ].filter((id): id is string => id !== null);
    const [users, employees, customers] = await Promise.all([
      this.names.ofUsers(userIds, locale),
      this.names.ofEmployees(employeeIds, locale),
      this.customers.summaries(db, sale.customer_id === null ? [] : [sale.customer_id]),
    ]);
    const user = (id: string | null) =>
      id === null ? null : { user_id: id, display_name: users.get(id) ?? '' };
    const employee = (id: string | null) =>
      id === null ? null : { id, display_name: employees.get(id) ?? '' };

    const totals = computeSaleTotals(
      items.map((item) => ({
        unit_price: item.unit_price_amount as Mmk,
        quantity: item.quantity,
        removed: item.removed_at !== null,
      })),
      payments.map((payment) => ({
        amount: payment.amount as Mmk,
        is_cash: payment.method.is_cash,
        voided: payment.voided_at !== null,
      })),
    );

    const itemDto = (item: ItemRow): SaleItemDto => ({
      id: item.id,
      sort_order: item.sort_order,
      line_type: item.line_type as SaleItemDto['line_type'],
      service_id: item.service_id,
      service_variant_id: item.service_variant_id,
      product_id: item.product_id,
      booking_item_id: item.booking_item_id,
      performed_by: employee(item.performed_by_employee_id),
      // No PERFORMER adjustment exists in this change (P4-RULE-15).
      effective_performed_by: employee(item.performed_by_employee_id),
      description_mm: item.description_mm,
      description_en: item.description_en,
      quantity: item.quantity,
      list_price_amount: wire(item.list_price_amount),
      unit_price_amount: wire(item.unit_price_amount),
      price_overridden: item.unit_price_amount !== item.list_price_amount,
      price_override_reason: item.price_override_reason,
      price_override_by: user(item.price_override_by_user_id),
      line_discount_amount: wire(item.line_discount_amount),
      line_total_amount: wire(item.line_total_amount ?? 0n),
      refunded_amount: 0,
      added_reason: item.added_reason,
      removed_at: instant(item.removed_at),
      removed_by: user(item.removed_by_user_id),
      removed_reason: item.removed_reason,
    });

    const paymentDto = (payment: PaymentRow): PaymentDto => {
      const method = {
        id: payment.method.id,
        code: payment.method.code,
        name_mm: payment.method.name_mm,
        name_en: payment.method.name_en,
        kind: payment.method.kind as PaymentDto['payment_method']['kind'],
      };
      const collector = employee(payment.collected_by_employee_id) ?? {
        id: payment.collected_by_employee_id,
        display_name: '',
      };
      return {
        id: payment.id,
        sale_id: payment.sale_id,
        payment_method: method,
        // No PAYMENT_METHOD / COLLECTED_BY adjustment exists in this change (P4-RULE-15).
        effective_payment_method: method,
        amount: wire(payment.amount),
        external_reference: payment.external_reference,
        collected_by: collector,
        effective_collected_by: collector,
        received_at: toMmtIso(payment.received_at),
        recorded_by: user(payment.recorded_by_user_id) ?? {
          user_id: payment.recorded_by_user_id,
          display_name: '',
        },
        requires_verification: payment.method.requires_verification,
        verified_at: instant(payment.verified_at),
        verified_by: user(payment.verified_by_user_id),
        voided_at: instant(payment.voided_at),
        voided_by: user(payment.voided_by_user_id),
        void_reason: payment.void_reason,
        created_at: toMmtIso(payment.created_at),
      };
    };

    return {
      id: sale.id,
      branch_id: sale.branch_id,
      visit_id: sale.visit_id,
      kind: 'service',
      status: sale.status as SaleDto['status'],
      customer: sale.customer_id === null ? null : (customers.get(sale.customer_id) ?? null),
      items: items.map(itemDto),
      subtotal_amount: wire(sale.subtotal_amount),
      discount_amount: wire(sale.discount_amount),
      discount: null,
      pending_discount_request: null,
      service_charge_rate: sale.service_charge_rate.toNumber(),
      service_charge_amount: wire(sale.service_charge_amount),
      tax_rate: sale.tax_rate.toNumber(),
      tax_amount: wire(sale.tax_amount),
      total_amount: wire(sale.total_amount),
      paid_amount: wire(totals.paid),
      remaining_amount: wire(totals.remaining),
      change_due_amount: wire(totals.change_due),
      payments: payments.map(paymentDto),
      receipt_number: sale.receipt_number,
      business_date: sale.business_date === null ? null : isoDate(sale.business_date),
      finished_at: instant(sale.finished_at),
      finished_by: user(sale.finished_by_user_id),
      cancelled_at: instant(sale.cancelled_at),
      refunds: refunds.map((refund) => ({
        id: refund.id,
        kind: refund.kind as SaleDto['refunds'][number]['kind'],
        amount: wire(refund.amount),
        refund_receipt_number: refund.refund_receipt_number,
        refunded_at: toMmtIso(refund.refunded_at),
        // The change of an over-transfer is written by FINISH at its finish time (owner B5).
        automatic_change:
          refund.kind === RefundKind.OVERPAYMENT_RETURN &&
          sale.finished_at !== null &&
          refund.refunded_at.getTime() === sale.finished_at.getTime(),
      })),
      refunded_amount: wire(
        sumMoney(
          refunds
            .filter((refund) => refund.kind === RefundKind.SALE_REFUND)
            .map((refund) => refund.amount as Mmk),
        ),
      ),
      adjustments: [],
      commission_estimate: null,
      difference_of: null,
      actions: saleActions(
        {
          sale_status: sale.status,
          visit_status: visit?.status ?? null,
          is_performer: visit?.performed_by_employee_id === viewer.actor.employee_id,
          is_recorder: visit?.started_by_user_id === viewer.actor.user_id,
        },
        viewer.rightsAt(sale.branch_id),
      ),
      warnings: [...warnings],
      created_at: toMmtIso(sale.created_at),
      updated_at: toMmtIso(sale.updated_at),
    };
  }
}
