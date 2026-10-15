import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The refunds of a sale (Part 4 — the sales module owns refunds). This change writes only the
// automatic change of an over-transfer at FINISH (group 8); the Sale DTO lists them.

export interface RefundRow {
  readonly id: string;
  readonly kind: number;
  readonly amount: bigint;
  readonly refund_receipt_number: string;
  readonly refunded_at: Date;
}

@Injectable()
export class RefundsRepository {
  async insert(
    tx: Tx,
    row: {
      id: string;
      client_request_id: string;
      sale_id: string;
      branch_id: string;
      kind: number;
      payment_method_id: string;
      amount: bigint;
      reason: string;
      receipt: { number: string; year: number; month: number; seq: number };
      business_date: string;
      refunded_at: Date;
      refunded_by_user_id: string;
    },
  ): Promise<void> {
    await tx.refunds.create({
      data: {
        id: row.id,
        client_request_id: row.client_request_id,
        sale_id: row.sale_id,
        branch_id: row.branch_id,
        kind: row.kind,
        payment_method_id: row.payment_method_id,
        amount: row.amount,
        reason: row.reason,
        refund_receipt_number: row.receipt.number,
        receipt_year: row.receipt.year,
        receipt_month: row.receipt.month,
        receipt_seq: row.receipt.seq,
        business_date: new Date(`${row.business_date}T00:00:00Z`),
        refunded_at: row.refunded_at,
        refunded_by_user_id: row.refunded_by_user_id,
        created_at: row.refunded_at,
      },
    });
  }

  ofSale(db: Tx, saleId: string): Promise<RefundRow[]> {
    return db.refunds.findMany({
      where: { sale_id: saleId },
      orderBy: [{ refunded_at: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        kind: true,
        amount: true,
        refund_receipt_number: true,
        refunded_at: true,
      },
    });
  }
}
