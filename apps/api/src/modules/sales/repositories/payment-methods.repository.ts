import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';

// Table `payment_methods` (Part 4 · P4-RULE-19 · D-PAY-01 / 02), owned by `sales`.
export interface PaymentMethodRow {
  readonly id: string;
  readonly company_id: string;
  readonly code: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly kind: number;
  readonly is_cash: boolean;
  readonly requires_reference: boolean;
  readonly requires_verification: boolean;
  readonly reference_regex: string | null;
  readonly sort_order: number;
}

@Injectable()
export class PaymentMethodsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? TransactionScope.current()?.tx ?? this.prisma;
  }

  /** The codes the company already has, archived rows included. */
  async codes(tx: Tx, companyId: string): Promise<Set<string>> {
    const rows = await this.db(tx).payment_methods.findMany({
      where: { company_id: companyId },
      select: { code: true },
    });
    return new Set(rows.map((row) => row.code));
  }

  async insert(tx: Tx, row: PaymentMethodRow, at: Date): Promise<void> {
    await tx.payment_methods.create({ data: { ...row, created_at: at, updated_at: at } });
  }
}
