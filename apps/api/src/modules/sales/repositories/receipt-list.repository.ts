import { Injectable } from '@nestjs/common';
import { SaleItemLineType, SaleStatus } from '@point/shared';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Tx } from '../../../common/database/transaction-runner.js';

// The reads behind the receipts list and lookup (P4.RCP.03 / 04 · add-receipts-list-lookup design D1 / D2):
// the FINISHED sales and the refunds of a branch and business date on their `(branch_id, business_date)`
// indexes, the performers of sales, and the two unique number columns. Read only; amounts are never
// selected (AD-PERM-05).

/** A receipt row of the list: the number, the instant it was issued, the sale it belongs to. */
export interface ReceiptRow {
  readonly kind: 'sale' | 'refund';
  readonly number: string;
  readonly sale_id: string;
  readonly refund_id: string | null;
  readonly issued_at: Date;
}

/** The place after which a page continues: the last item of the page before (owner RL1 order). */
export interface ReceiptPosition {
  readonly issued_at: Date;
  readonly kind: 'sale' | 'refund';
  readonly number: string;
}

export interface ReceiptDayFilter {
  readonly branch_id: string;
  /** The business date `YYYY-MM-DD`. */
  readonly business_date: string;
  readonly after: ReceiptPosition | undefined;
  readonly take: number;
}

/** The receipt found by its number, with the branch the read scope is checked against. */
export interface ReceiptFound extends ReceiptRow {
  readonly branch_id: string;
}

const day = (date: string): Date => new Date(`${date}T00:00:00Z`);

@Injectable()
export class ReceiptListRepository {
  /** FINISHED sales of the day, newest first (`finished_at`, then the number, descending). */
  async salesOfDay(db: Tx, filter: ReceiptDayFilter): Promise<ReceiptRow[]> {
    const { after } = filter;
    // A sale (rank 0) follows the position at the same instant only when that was a sale with a larger number.
    const later: Prisma.salesWhereInput[] =
      after === undefined
        ? []
        : [
            { finished_at: { lt: after.issued_at } },
            ...(after.kind === 'sale'
              ? [{ finished_at: after.issued_at, receipt_number: { lt: after.number } }]
              : []),
          ];
    const rows = await db.sales.findMany({
      where: {
        branch_id: filter.branch_id,
        status: SaleStatus.FINISHED,
        business_date: day(filter.business_date),
        receipt_number: { not: null },
        finished_at: { not: null },
        ...(after === undefined ? {} : { OR: later }),
      },
      orderBy: [{ finished_at: 'desc' }, { receipt_number: 'desc' }],
      take: filter.take,
      select: { id: true, receipt_number: true, finished_at: true },
    });
    return rows.flatMap((row) =>
      row.receipt_number === null || row.finished_at === null
        ? []
        : [
            {
              kind: 'sale' as const,
              number: row.receipt_number,
              sale_id: row.id,
              refund_id: null,
              issued_at: row.finished_at,
            },
          ],
    );
  }

  /** Refunds of the day, newest first (`refunded_at`, then the RF number, descending). */
  async refundsOfDay(db: Tx, filter: ReceiptDayFilter): Promise<ReceiptRow[]> {
    const { after } = filter;
    // A refund (rank 1) follows the position at the same instant when that was a sale, or a refund with a larger number.
    const later: Prisma.refundsWhereInput[] =
      after === undefined
        ? []
        : [
            { refunded_at: { lt: after.issued_at } },
            after.kind === 'sale'
              ? { refunded_at: after.issued_at }
              : { refunded_at: after.issued_at, refund_receipt_number: { lt: after.number } },
          ];
    const rows = await db.refunds.findMany({
      where: {
        branch_id: filter.branch_id,
        business_date: day(filter.business_date),
        ...(after === undefined ? {} : { OR: later }),
      },
      orderBy: [{ refunded_at: 'desc' }, { refund_receipt_number: 'desc' }],
      take: filter.take,
      select: { id: true, sale_id: true, refund_receipt_number: true, refunded_at: true },
    });
    return rows.map((row) => ({
      kind: 'refund' as const,
      number: row.refund_receipt_number,
      sale_id: row.sale_id,
      refund_id: row.id,
      issued_at: row.refunded_at,
    }));
  }

  /**
   * The performers of the active SERVICE lines of the sales, one row per sale (`GROUP BY sale_id`), the
   * employee ids in line order — a repeat is the caller's to drop. At most one row per sale id (CG-PERF-02).
   */
  async performersOf(db: Tx, saleIds: readonly string[]): Promise<Map<string, string[]>> {
    if (saleIds.length === 0) return new Map();
    const rows = await db.$queryRaw<{ sale_id: string; employee_ids: string[] }[]>`
      SELECT sale_id::text AS sale_id,
             array_agg(performed_by_employee_id::text ORDER BY sort_order) AS employee_ids
        FROM sale_items
       WHERE sale_id = ANY(${[...saleIds]}::uuid[])
         AND line_type = ${SaleItemLineType.SERVICE}
         AND removed_at IS NULL
         AND performed_by_employee_id IS NOT NULL
       GROUP BY sale_id
       LIMIT ${saleIds.length}`;
    return new Map(rows.map((row) => [row.sale_id, row.employee_ids]));
  }

  /** A FINISHED sale by its receipt number (a number is set only when FINISHED — CHECK). */
  async saleByNumber(db: Tx, number: string): Promise<ReceiptFound | null> {
    const row = await db.sales.findUnique({
      where: { receipt_number: number },
      select: { id: true, branch_id: true, receipt_number: true, finished_at: true },
    });
    if (row === null || row.receipt_number === null || row.finished_at === null) return null;
    return {
      kind: 'sale',
      number: row.receipt_number,
      sale_id: row.id,
      refund_id: null,
      issued_at: row.finished_at,
      branch_id: row.branch_id,
    };
  }

  async refundByNumber(db: Tx, number: string): Promise<ReceiptFound | null> {
    const row = await db.refunds.findUnique({
      where: { refund_receipt_number: number },
      select: { id: true, sale_id: true, branch_id: true, refunded_at: true },
    });
    if (row === null) return null;
    return {
      kind: 'refund',
      number,
      sale_id: row.sale_id,
      refund_id: row.id,
      issued_at: row.refunded_at,
      branch_id: row.branch_id,
    };
  }
}
