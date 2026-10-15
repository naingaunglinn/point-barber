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

  /** The payment rows of a sale, locked FOR UPDATE (INCOMPLETE — design D4). */
  async lockOfSale(tx: Tx, saleId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM payments WHERE sale_id = ${saleId}::uuid FOR UPDATE`;
  }
}
