import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@point/shared';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Tx } from '../../../common/database/transaction-runner.js';

export interface SaleRow {
  readonly id: string;
  readonly client_request_id: string;
  readonly branch_id: string;
  readonly visit_id: string | null;
  readonly customer_id: string | null;
  readonly status: number;
  readonly subtotal_amount: bigint;
  readonly discount_amount: bigint;
  readonly service_charge_rate: Prisma.Decimal;
  readonly service_charge_amount: bigint;
  readonly tax_rate: Prisma.Decimal;
  readonly tax_amount: bigint;
  readonly total_amount: bigint;
  readonly receipt_number: string | null;
  readonly business_date: Date | null;
  readonly finished_at: Date | null;
  readonly finished_by_user_id: string | null;
  readonly cancelled_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const SALE = {
  id: true,
  client_request_id: true,
  branch_id: true,
  visit_id: true,
  customer_id: true,
  status: true,
  subtotal_amount: true,
  discount_amount: true,
  service_charge_rate: true,
  service_charge_amount: true,
  tax_rate: true,
  tax_amount: true,
  total_amount: true,
  receipt_number: true,
  business_date: true,
  finished_at: true,
  finished_by_user_id: true,
  cancelled_at: true,
  created_at: true,
  updated_at: true,
} as const;

// The sales table (Part 4 — the sales module owns it). Reads and writes of the walk-in flow join here
// as the change builds them.

@Injectable()
export class SalesRepository {
  insertOpen(
    tx: Tx,
    row: { id: string; client_request_id: string; branch_id: string; visit_id: string; at: Date },
  ): Promise<SaleRow> {
    return tx.sales.create({
      data: {
        id: row.id,
        client_request_id: row.client_request_id,
        branch_id: row.branch_id,
        visit_id: row.visit_id,
        status: SaleStatus.OPEN,
        created_at: row.at,
        updated_at: row.at,
      },
      select: SALE,
    });
  }

  find(db: Tx, id: string): Promise<SaleRow | null> {
    return db.sales.findUnique({ where: { id }, select: SALE });
  }

  findByVisit(db: Tx, visitId: string): Promise<SaleRow | null> {
    return db.sales.findUnique({ where: { visit_id: visitId }, select: SALE });
  }

  /** The sale row, locked FOR UPDATE until commit (design D4); null when there is none. */
  async lockForUpdate(tx: Tx, id: string): Promise<SaleRow | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM sales WHERE id = ${id}::uuid FOR UPDATE`;
    return locked.length === 0 ? null : this.find(tx, id);
  }

  async writeTotals(
    tx: Tx,
    id: string,
    totals: {
      subtotal: bigint;
      discount: bigint;
      service_charge: bigint;
      tax: bigint;
      total: bigint;
    },
    at: Date,
  ): Promise<void> {
    await tx.sales.update({
      where: { id },
      data: {
        subtotal_amount: totals.subtotal,
        discount_amount: totals.discount,
        service_charge_amount: totals.service_charge,
        tax_amount: totals.tax,
        total_amount: totals.total,
        updated_at: at,
      },
    });
  }

  async cancel(tx: Tx, id: string, at: Date): Promise<void> {
    await tx.sales.update({
      where: { id },
      data: { status: SaleStatus.CANCELLED, cancelled_at: at, updated_at: at },
    });
  }

  /** The latest finish time of a customer's FINISHED visit sales at the branches (null = any). */
  async lastVisitFinishedAt(
    db: Tx,
    customerId: string,
    branchIds: readonly string[] | null,
  ): Promise<Date | null> {
    const row = await db.sales.aggregate({
      where: {
        customer_id: customerId,
        status: SaleStatus.FINISHED,
        visit_id: { not: null },
        ...(branchIds === null ? {} : { branch_id: { in: [...branchIds] } }),
      },
      _max: { finished_at: true },
    });
    return row._max.finished_at;
  }
}
