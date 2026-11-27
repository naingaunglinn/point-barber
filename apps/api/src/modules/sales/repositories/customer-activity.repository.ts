import { Injectable } from '@nestjs/common';
import { RefundKind, SaleStatus } from '@point/shared';
import { z } from 'zod';

import { Prisma } from '../../../generated/prisma/client.js';
import type { ReadScope } from '../../../common/access/read-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';

// The customer's Part 4 history as booking's CustomerActivity port reads it (add-customer-management
// design D3 / D6 · walk-in D1): queries of `sales` and `refunds` only — the visit fields come from
// delivery through the VisitsPort. One definition of a finished visit: a FINISHED sale of the customer
// that has a visit (D-VIS-07), at a branch in the read scope; a refund counts with its sale's branch.

const aggregateRowSchema = z.object({ visit_count: z.number().int(), last_visit_at: z.date() });
const totalsRowSchema = z.object({
  visit_count: z.number().int(),
  last_visit_at: z.date().nullable(),
  sales_total: z.bigint(),
  refunded_total: z.bigint(),
});
const recentRowSchema = z.object({ visit_id: z.uuid(), finished_at: z.date() });

const timelineSaleSchema = z.object({
  id: z.uuid(),
  visit_id: z.uuid().nullable(),
  status: z.number().int(),
  branch_id: z.uuid(),
  receipt_number: z.string().nullable(),
  total_amount: z.bigint(),
  finished_at: z.date().nullable(),
});

export type TimelineSaleRow = z.infer<typeof timelineSaleSchema>;
export type CustomerTotalsRow = z.infer<typeof totalsRowSchema>;
export type RecentVisitSaleRow = z.infer<typeof recentRowSchema>;

/** `AND <column> = ANY(<branch ids>)`, nothing at company scope. */
function inScope(column: Prisma.Sql, scope: ReadScope): Prisma.Sql {
  return scope === 'all' ? Prisma.empty : Prisma.sql`AND ${column} = ANY(${[...scope]}::uuid[])`;
}

/** The customer's FINISHED sales in the scope (with or without a visit). */
const finishedSales = (customerId: string, scope: ReadScope): Prisma.Sql => Prisma.sql`
  FROM sales s
  WHERE s.customer_id = ${customerId}::uuid AND s.status = ${SaleStatus.FINISHED}
    ${inScope(Prisma.sql`s.branch_id`, scope)}`;

@Injectable()
export class CustomerActivityRepository {
  /**
   * `customer_id, last_visit_at, visit_count` per customer — the definition of a finished visit as a
   * query piece the customer list joins and sorts on (design D3).
   */
  visitAggregate(scope: ReadScope): Prisma.Sql {
    return Prisma.sql`
      SELECT s.customer_id, max(s.finished_at) AS last_visit_at, count(*)::int AS visit_count
      FROM sales s
      WHERE s.status = ${SaleStatus.FINISHED} AND s.visit_id IS NOT NULL
        AND s.customer_id IS NOT NULL ${inScope(Prisma.sql`s.branch_id`, scope)}
      GROUP BY s.customer_id`;
  }

  /** The piece of one customer: their visit count and last visit, or null without a visit. */
  async visitsOf(
    db: Tx,
    customerId: string,
    scope: ReadScope,
  ): Promise<z.infer<typeof aggregateRowSchema> | null> {
    const rows = await db.$queryRaw<unknown[]>`
      SELECT v.visit_count, v.last_visit_at FROM (${this.visitAggregate(scope)}) AS v
      WHERE v.customer_id = ${customerId}::uuid`;
    return rows.length === 0 ? null : aggregateRowSchema.parse(rows[0]);
  }

  /**
   * The visit piece of the customer and the two money sums of design D6: Σ total of the FINISHED
   * sales and Σ kind-1 SALE_REFUND amounts of those sales — each summed on its own rows, so a sale
   * with two refunds counts its total once.
   */
  async totals(db: Tx, customerId: string, scope: ReadScope): Promise<CustomerTotalsRow> {
    const rows = await db.$queryRaw<unknown[]>`
      SELECT coalesce(v.visit_count, 0) AS visit_count, v.last_visit_at,
        (SELECT coalesce(sum(s.total_amount), 0)::bigint ${finishedSales(customerId, scope)})
          AS sales_total,
        (SELECT coalesce(sum(r.amount), 0)::bigint FROM refunds r
         WHERE r.kind = ${RefundKind.SALE_REFUND}
           AND r.sale_id IN (SELECT s.id ${finishedSales(customerId, scope)})) AS refunded_total
      FROM (SELECT 1) AS one
      LEFT JOIN (${this.visitAggregate(scope)}) AS v ON v.customer_id = ${customerId}::uuid`;
    return totalsRowSchema.parse(rows[0]);
  }

  /**
   * The timeline's sales side, cut in SQL (design D10 · R6 · CG-PERF-02): a visit-backed sale is an entry
   * at its visit's `started_at` with the visit's id, a FINISHED visit-less sale one at `finished_at`
   * with its own id. Strictly older than `before` on `(at, id)`, newest first, at most `take`. Only
   * the visit's start is read from `visits` (the ordering key); every other visit field comes from
   * delivery through the VisitsPort.
   */
  async timelineSales(
    db: Tx,
    customerId: string,
    scope: ReadScope,
    before: { readonly at: Date; readonly id: string } | null,
    take: number,
  ): Promise<TimelineSaleRow[]> {
    const rows = await db.$queryRaw<unknown[]>`
      SELECT s.id, s.visit_id, s.status, s.branch_id, s.receipt_number, s.total_amount, s.finished_at,
        coalesce(v.started_at, s.finished_at) AS entry_at, coalesce(s.visit_id, s.id) AS entry_id
      FROM sales s
      LEFT JOIN visits v ON v.id = s.visit_id
      WHERE s.customer_id = ${customerId}::uuid ${inScope(Prisma.sql`s.branch_id`, scope)}
        AND (s.visit_id IS NOT NULL
          OR (s.status = ${SaleStatus.FINISHED} AND s.finished_at IS NOT NULL
              AND s.receipt_number IS NOT NULL))
        ${
          before === null
            ? Prisma.empty
            : Prisma.sql`AND (coalesce(v.started_at, s.finished_at), coalesce(s.visit_id, s.id))
                < (${before.at}::timestamptz, ${before.id}::uuid)`
        }
      ORDER BY entry_at DESC, entry_id DESC
      LIMIT ${take}`;
    return rows.map((row) => timelineSaleSchema.parse(row));
  }

  /** The last `window` finished visit sales of the customer, newest first (`finished_at`, `id`). */
  async recentVisitSales(
    db: Tx,
    customerId: string,
    scope: ReadScope,
    window: number,
  ): Promise<RecentVisitSaleRow[]> {
    const rows = await db.$queryRaw<unknown[]>`
      SELECT s.visit_id, s.finished_at ${finishedSales(customerId, scope)} AND s.visit_id IS NOT NULL
      ORDER BY s.finished_at DESC, s.id DESC
      LIMIT ${window}`;
    return rows.map((row) => recentRowSchema.parse(row));
  }
}
