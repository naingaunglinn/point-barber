import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The payments of a sale (Part 4 — the sales module owns payments). This group reads them for the
// totals and the Sale DTO; payment add and void come with group 7. The effective method is the stored
// one until PAYMENT_METHOD adjustments exist (P4-RULE-15 — later changes).

export interface PaymentMethodRef {
  readonly id: string;
  readonly code: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly kind: number;
  readonly is_cash: boolean;
  readonly requires_verification: boolean;
}

export interface PaymentRow {
  readonly id: string;
  readonly sale_id: string;
  readonly amount: bigint;
  readonly external_reference: string | null;
  readonly collected_by_employee_id: string;
  readonly received_at: Date;
  readonly recorded_by_user_id: string;
  readonly verified_at: Date | null;
  readonly verified_by_user_id: string | null;
  readonly voided_at: Date | null;
  readonly voided_by_user_id: string | null;
  readonly void_reason: string | null;
  readonly created_at: Date;
  readonly method: PaymentMethodRef;
}

@Injectable()
export class PaymentsRepository {
  async ofSale(db: Tx, saleId: string): Promise<PaymentRow[]> {
    const rows = await db.payments.findMany({
      where: { sale_id: saleId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        sale_id: true,
        amount: true,
        external_reference: true,
        collected_by_employee_id: true,
        received_at: true,
        recorded_by_user_id: true,
        verified_at: true,
        verified_by_user_id: true,
        voided_at: true,
        voided_by_user_id: true,
        void_reason: true,
        created_at: true,
        payment_methods: {
          select: {
            id: true,
            code: true,
            name_mm: true,
            name_en: true,
            kind: true,
            is_cash: true,
            requires_verification: true,
          },
        },
      },
    });
    return rows.map(({ payment_methods, ...row }) => ({ ...row, method: payment_methods }));
  }

  async insert(
    tx: Tx,
    row: {
      id: string;
      client_request_id: string;
      sale_id: string;
      payment_method_id: string;
      amount: bigint;
      external_reference: string | null;
      collected_by_employee_id: string;
      received_at: Date;
      recorded_by_user_id: string;
    },
  ): Promise<void> {
    await tx.payments.create({
      data: { ...row, created_at: row.received_at },
    });
  }

  /** The identifying fields of the payment stored under a client request id (design D7). */
  findByClientRequestId(
    db: Tx,
    key: string,
  ): Promise<{
    id: string;
    sale_id: string;
    payment_method_id: string;
    amount: bigint;
    recorded_by_user_id: string;
  } | null> {
    return db.payments.findUnique({
      where: { client_request_id: key },
      select: {
        id: true,
        sale_id: true,
        payment_method_id: true,
        amount: true,
        recorded_by_user_id: true,
      },
    });
  }

  find(
    db: Tx,
    id: string,
  ): Promise<{ id: string; sale_id: string; voided_at: Date | null } | null> {
    return db.payments.findUnique({
      where: { id },
      select: { id: true, sale_id: true, voided_at: true },
    });
  }

  /** The sale of the non-voided payment that holds a reference of a method (D-PAY-02). */
  async referenceHolder(
    db: Tx,
    methodId: string,
    reference: string,
  ): Promise<{ sale_status: number; receipt_number: string | null } | null> {
    const row = await db.payments.findFirst({
      where: { payment_method_id: methodId, external_reference: reference, voided_at: null },
      select: { sales: { select: { status: true, receipt_number: true } } },
    });
    return row === null
      ? null
      : { sale_status: row.sales.status, receipt_number: row.sales.receipt_number };
  }

  /** One payment row, locked FOR UPDATE (void — design D4 step 3). */
  async lockOne(tx: Tx, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
  }

  async markVoided(
    tx: Tx,
    id: string,
    voiding: { at: Date; by_user_id: string; reason: string },
  ): Promise<void> {
    await tx.payments.update({
      where: { id },
      data: {
        voided_at: voiding.at,
        voided_by_user_id: voiding.by_user_id,
        void_reason: voiding.reason,
      },
    });
  }

  /** `payref:<method_id>:<reference>` — exclusive, held to commit (P4-RULE-09 · CG-DB-08). */
  async lockReference(tx: Tx, methodId: string, reference: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payref:${methodId}:${reference}`}, 0))`;
  }

  /** The payment rows of a sale, locked FOR UPDATE (INCOMPLETE — design D4). */
  async lockOfSale(tx: Tx, saleId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM payments WHERE sale_id = ${saleId}::uuid FOR UPDATE`;
  }
}
