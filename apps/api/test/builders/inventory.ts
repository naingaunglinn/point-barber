import { randomUUID } from 'node:crypto';

import {
  PurchaseStatus,
  SaleItemLineType,
  SaleStatus,
  StockCountStatus,
  StockTransferStatus,
  businessDateOf,
  type Mmk,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import type { PrismaService } from '../../src/common/database/prisma.service.js';

// add-product-catalogue task 1.7 (design D6 · "Scenario rows"): the Part 6 rows that the changes after this
// one write (#56 – #60, #57), inserted directly so the product reads and the archive guard can be tested
// now. Each builder inserts only the rows the design names and meets the DB Part 6 / Part 4 checks.
// Test data only.

const ADMIN = FIXTURE_IDS.users.E001;

/** The MMT `date` column of an instant (the business date — CG-TIME-02). */
const dateColumn = (at: Date): Date => new Date(`${businessDateOf(at)}T00:00:00Z`);

/** `branch_stock_levels` — a product's quantity at a branch (Pomade at B3 = 3, at B1 = -1). */
export async function stockLevel(
  prisma: PrismaService,
  spec: {
    readonly branch: string;
    readonly product: string;
    readonly quantity: number;
    readonly threshold?: number | null;
  },
): Promise<string> {
  const id = randomUUID();
  await prisma.branch_stock_levels.create({
    data: {
      id,
      branch_id: spec.branch,
      product_id: spec.product,
      quantity_on_hand: spec.quantity,
      low_stock_threshold: spec.threshold ?? null,
    },
  });
  return id;
}

export interface TransferSpec {
  readonly from: string;
  readonly to: string;
  /** Quantity sent per product. */
  readonly items: readonly { readonly product: string; readonly quantity: number }[];
  readonly at?: Date;
}

async function transfer(
  prisma: PrismaService,
  spec: TransferSpec,
  status: typeof StockTransferStatus.DRAFT | typeof StockTransferStatus.SENT,
): Promise<{ transferId: string; itemIds: string[] }> {
  const at = spec.at ?? new Date('2026-10-05T09:00:00+06:30');
  const transferId = randomUUID();
  await prisma.stock_transfers.create({
    data: {
      id: transferId,
      from_branch_id: spec.from,
      to_branch_id: spec.to,
      status,
      // BRANCH_STAFF (2): any staff member of the receiving branch receives; no named employee.
      receiver_type: 2,
      created_by_user_id: ADMIN,
      created_at: at,
      updated_at: at,
      ...(status === StockTransferStatus.SENT ? { sent_at: at, sent_by_user_id: ADMIN } : {}),
    },
  });
  const itemIds: string[] = [];
  for (const item of spec.items) {
    const id = randomUUID();
    itemIds.push(id);
    await prisma.stock_transfer_items.create({
      data: {
        id,
        stock_transfer_id: transferId,
        product_id: item.product,
        quantity_sent: item.quantity,
      },
    });
  }
  return { transferId, itemIds };
}

/** A SENT transfer (the stock has left the sender): B1 → B3 carrying 2 Pomade in the scenarios. */
export const sentTransfer = (prisma: PrismaService, spec: TransferSpec) =>
  transfer(prisma, spec, StockTransferStatus.SENT);

/** A DRAFT transfer: lines only, nothing sent. */
export const draftTransfer = (prisma: PrismaService, spec: TransferSpec) =>
  transfer(prisma, spec, StockTransferStatus.DRAFT);

/** A DRAFT purchase: Hair colour black at B3, 5 × 9,000 = 45,000 in the scenarios (Part 6's example). */
export async function draftPurchase(
  prisma: PrismaService,
  spec: {
    readonly supplier?: string | null;
    readonly lines: readonly {
      readonly branch: string;
      readonly product: string;
      readonly quantity: number;
      readonly unitCost: Mmk;
    }[];
    readonly purchasedAt?: Date;
  },
): Promise<{ purchaseId: string; itemIds: string[] }> {
  const purchasedAt = spec.purchasedAt ?? new Date('2026-10-05T09:00:00+06:30');
  const company = await prisma.companies.findFirstOrThrow({ select: { id: true } });
  const total = spec.lines.reduce((sum, line) => sum + BigInt(line.quantity) * line.unitCost, 0n);
  const purchaseId = randomUUID();
  await prisma.purchases.create({
    data: {
      id: purchaseId,
      company_id: company.id,
      supplier_id: spec.supplier ?? null,
      status: PurchaseStatus.DRAFT,
      total_amount: total,
      purchased_at: purchasedAt,
      business_date: dateColumn(purchasedAt),
      created_by_user_id: ADMIN,
    },
  });
  const itemIds: string[] = [];
  for (const line of spec.lines) {
    const id = randomUUID();
    itemIds.push(id);
    await prisma.purchase_items.create({
      data: {
        id,
        purchase_id: purchaseId,
        branch_id: line.branch,
        product_id: line.product,
        quantity: line.quantity,
        unit_cost_amount: line.unitCost,
      },
    });
  }
  return { purchaseId, itemIds };
}

/** An IN_PROGRESS stock count listing the products (B1 listing Shampoo in the scenarios). */
export async function countInProgress(
  prisma: PrismaService,
  spec: { readonly branch: string; readonly products: readonly string[]; readonly at?: Date },
): Promise<{ countId: string; itemIds: string[] }> {
  const at = spec.at ?? new Date('2026-10-05T09:00:00+06:30');
  const countId = randomUUID();
  await prisma.stock_counts.create({
    data: {
      id: countId,
      branch_id: spec.branch,
      status: StockCountStatus.IN_PROGRESS,
      started_at: at,
      started_by_user_id: ADMIN,
    },
  });
  const itemIds: string[] = [];
  for (const product of spec.products) {
    const id = randomUUID();
    itemIds.push(id);
    await prisma.stock_count_items.create({
      data: { id, stock_count_id: countId, product_id: product, expected_quantity: 0 },
    });
  }
  return { countId, itemIds };
}

/** An OPEN sale at the branch with one product line (a Pomade line at 12,000 in the scenarios). */
export async function openSaleWithProduct(
  prisma: PrismaService,
  spec: {
    readonly branch: string;
    readonly product: string;
    readonly quantity?: number;
    readonly listPrice: Mmk;
  },
): Promise<{ saleId: string; itemId: string }> {
  const quantity = spec.quantity ?? 1;
  const subtotal = BigInt(quantity) * spec.listPrice;
  const saleId = randomUUID();
  await prisma.sales.create({
    data: {
      id: saleId,
      client_request_id: randomUUID(),
      branch_id: spec.branch,
      status: SaleStatus.OPEN,
      subtotal_amount: subtotal,
      total_amount: subtotal,
    },
  });
  const itemId = randomUUID();
  await prisma.sale_items.create({
    data: {
      id: itemId,
      sale_id: saleId,
      sort_order: 1,
      line_type: SaleItemLineType.PRODUCT,
      product_id: spec.product,
      description_mm: 'Product',
      quantity,
      list_price_amount: spec.listPrice,
      unit_price_amount: spec.listPrice,
    },
  });
  return { saleId, itemId };
}

/** A MANUAL_ADJUST (8) movement with its reason (Entry error at B3 in the scenarios). */
export async function manualAdjustMovement(
  prisma: PrismaService,
  spec: {
    readonly branch: string;
    readonly product: string;
    readonly delta: number;
    readonly reason: string;
    readonly at?: Date;
  },
): Promise<string> {
  const at = spec.at ?? new Date('2026-10-05T09:00:00+06:30');
  const id = randomUUID();
  await prisma.stock_movements.create({
    data: {
      id,
      client_request_id: randomUUID(),
      branch_id: spec.branch,
      product_id: spec.product,
      movement_type: 8,
      quantity_delta: spec.delta,
      adjustment_reason_id: spec.reason,
      occurred_at: at,
      business_date: dateColumn(at),
      recorded_by_user_id: ADMIN,
    },
  });
  return id;
}
