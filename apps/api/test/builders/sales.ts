import { randomUUID } from 'node:crypto';

import { type RefundKind, SaleStatus, VisitStatus, businessDateOf, type Mmk } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import type { PrismaService } from '../../src/common/database/prisma.service.js';
import type { FixturePerson } from '../helpers/seeded.js';

// add-customer-management task 2.1 (design D13) — a customer's Part 4 history written directly: a
// FINISHED sale with or without its FINISHED visit and with its refunds, and an INCOMPLETE visit whose
// sale is CANCELLED. Test data only (spec-fixtures §2: Ma Su's B3 and B1 visits). Each row meets the
// Part 4 checks — `total = subtotal`, the receipt fields of its number, the MMT business dates.

const { users, employees, customers } = FIXTURE_IDS;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** `B3-2026-SEP-00006` or `B3-RF-2026-SEP-00002` → its year, month and sequence columns. */
function receiptParts(receipt: string): { year: number; month: number; seq: number } {
  const match = /-(\d{4})-([A-Z]{3})-(\d{5,})$/.exec(receipt);
  if (match === null) throw new Error(`Not a receipt number: ${receipt}`);
  const [, year = '', month = '', seq = ''] = match;
  return { year: Number(year), month: MONTHS.indexOf(month) + 1, seq: Number(seq) };
}

const dateColumn = (at: Date): Date => new Date(`${businessDateOf(at)}T00:00:00Z`);

async function paymentMethod(prisma: PrismaService, code: 'CASH' | 'KBZPAY'): Promise<string> {
  const row = await prisma.payment_methods.findFirstOrThrow({
    where: { code },
    select: { id: true },
  });
  return row.id;
}

export interface FinishedSaleSpec {
  readonly branch: string;
  readonly receipt: string;
  readonly total: Mmk;
  readonly finishedAt: Date;
  /** Ma Su unless given; null = an anonymous sale. */
  readonly customer?: string | null;
  /** The FINISHED visit of the sale; none = a visit-less sale (a product-only sale — D-PAY-03). */
  readonly visit?: { readonly performer: FixturePerson; readonly startedAt: Date };
  readonly refunds?: readonly {
    readonly kind: RefundKind;
    readonly amount: Mmk;
    readonly receipt: string;
    readonly at: Date;
  }[];
}

/** A FINISHED sale (and visit, and refunds); returns the sale id and the visit id. */
export async function finishedSale(
  prisma: PrismaService,
  spec: FinishedSaleSpec,
): Promise<{ saleId: string; visitId: string | null }> {
  const finisher = users[spec.visit?.performer ?? 'E001'];
  const visitId = spec.visit === undefined ? null : randomUUID();
  if (spec.visit !== undefined && visitId !== null) {
    await prisma.visits.create({
      data: {
        id: visitId,
        client_request_id: randomUUID(),
        branch_id: spec.branch,
        performed_by_employee_id: employees[spec.visit.performer],
        started_by_user_id: finisher,
        started_at: spec.visit.startedAt,
        business_date: dateColumn(spec.visit.startedAt),
        status: VisitStatus.FINISHED,
        completed_at: spec.finishedAt,
        completed_by_user_id: finisher,
        finished_at: spec.finishedAt,
      },
    });
  }
  const saleId = randomUUID();
  const parts = receiptParts(spec.receipt);
  await prisma.sales.create({
    data: {
      id: saleId,
      client_request_id: randomUUID(),
      branch_id: spec.branch,
      visit_id: visitId,
      customer_id: spec.customer === undefined ? customers.MA_SU : spec.customer,
      status: SaleStatus.FINISHED,
      subtotal_amount: spec.total,
      total_amount: spec.total,
      receipt_number: spec.receipt,
      receipt_year: parts.year,
      receipt_month: parts.month,
      receipt_seq: parts.seq,
      finished_at: spec.finishedAt,
      finished_by_user_id: finisher,
      business_date: dateColumn(spec.finishedAt),
    },
  });
  const cash = await paymentMethod(prisma, 'CASH');
  for (const refund of spec.refunds ?? []) {
    const rf = receiptParts(refund.receipt);
    await prisma.refunds.create({
      data: {
        id: randomUUID(),
        client_request_id: randomUUID(),
        sale_id: saleId,
        branch_id: spec.branch,
        kind: refund.kind,
        payment_method_id: cash,
        amount: refund.amount,
        reason: 'Test refund',
        refund_receipt_number: refund.receipt,
        receipt_year: rf.year,
        receipt_month: rf.month,
        receipt_seq: rf.seq,
        business_date: dateColumn(refund.at),
        refunded_at: refund.at,
        refunded_by_user_id: users.E001,
      },
    });
  }
  return { saleId, visitId };
}

/** An INCOMPLETE visit of the customer whose sale is CANCELLED (D-VIS-07); returns the visit id. */
export async function incompleteVisit(
  prisma: PrismaService,
  spec: {
    readonly branch: string;
    readonly performer: FixturePerson;
    readonly startedAt: Date;
    readonly customer?: string;
  },
): Promise<string> {
  const visitId = randomUUID();
  const by = users[spec.performer];
  const at = new Date(spec.startedAt.getTime() + 10 * 60_000);
  await prisma.visits.create({
    data: {
      id: visitId,
      client_request_id: randomUUID(),
      branch_id: spec.branch,
      performed_by_employee_id: employees[spec.performer],
      started_by_user_id: by,
      started_at: spec.startedAt,
      business_date: dateColumn(spec.startedAt),
      status: VisitStatus.INCOMPLETE,
      incomplete_reason: 'Customer left',
      incomplete_at: at,
      incomplete_by_user_id: by,
    },
  });
  await prisma.sales.create({
    data: {
      id: randomUUID(),
      client_request_id: randomUUID(),
      branch_id: spec.branch,
      visit_id: visitId,
      customer_id: spec.customer ?? customers.MA_SU,
      status: SaleStatus.CANCELLED,
      cancelled_at: at,
    },
  });
  return visitId;
}
