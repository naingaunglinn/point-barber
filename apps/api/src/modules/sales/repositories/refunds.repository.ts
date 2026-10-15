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
