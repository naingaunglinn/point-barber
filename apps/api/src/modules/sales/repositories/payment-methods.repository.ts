import { Injectable } from '@nestjs/common';
import { PaymentMethodStatus } from '@point/shared';

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

export interface PaymentMethodListRow {
  readonly id: string;
  readonly code: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly kind: number;
  readonly is_cash: boolean;
  readonly requires_reference: boolean;
  readonly requires_verification: boolean;
  readonly reference_regex: string | null;
  readonly sort_order: number;
  readonly status: number;
  readonly archived_at: Date | null;
  readonly updated_at: Date;
}

const LIST = {
  id: true,
  code: true,
  name_mm: true,
  name_en: true,
  kind: true,
  is_cash: true,
  requires_reference: true,
  requires_verification: true,
  reference_regex: true,
  sort_order: true,
  status: true,
  archived_at: true,
  updated_at: true,
} as const;

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

  /** P4.PMT.01 — the ACTIVE, not archived methods in `sort_order` (Cash first). */
  active(db: Tx): Promise<PaymentMethodListRow[]> {
    return db.payment_methods.findMany({
      where: { status: PaymentMethodStatus.ACTIVE, archived_at: null },
      orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
      select: LIST,
    });
  }

  /** The method with a code (the base seed's CASH, for the change of an over-transfer). */
  byCode(db: Tx, code: string): Promise<PaymentMethodListRow | null> {
    return db.payment_methods.findFirst({ where: { code }, select: LIST });
  }

  find(db: Tx, id: string): Promise<PaymentMethodListRow | null> {
    return db.payment_methods.findUnique({ where: { id }, select: LIST });
  }

  async insert(tx: Tx, row: PaymentMethodRow, at: Date): Promise<void> {
    await tx.payment_methods.create({ data: { ...row, created_at: at, updated_at: at } });
  }
}
