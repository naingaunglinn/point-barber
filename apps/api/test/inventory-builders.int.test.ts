import type { Mmk } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  countInProgress,
  draftPurchase,
  draftTransfer,
  manualAdjustMovement,
  openSaleWithProduct,
  sentTransfer,
  stockLevel,
} from './builders/inventory.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-product-catalogue task 1.7 (design D6 · "Scenario rows") — each builder inserts the rows the design names
// and the DB Part 6 / Part 4 checks accept them. The archive guard and the stock summary of group 4 read
// these rows; the changes that write them come later (#56 – #60, #57).
const { branches, products, stockAdjustmentReasons, suppliers } = FIXTURE_IDS;
let t: SeededApp;

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T10:00:00+06:30') });
});
afterAll(async () => {
  await t.close();
});

describe('add-product-catalogue · inventory builders', () => {
  it('stockLevel: Pomade at B3 = 3 and at B1 = -1', async () => {
    await stockLevel(t.prisma, { branch: branches.B3, product: products.POMADE, quantity: 3 });
    await stockLevel(t.prisma, { branch: branches.B1, product: products.POMADE, quantity: -1 });
    const rows = await t.prisma.branch_stock_levels.findMany({
      where: { product_id: products.POMADE },
      orderBy: { quantity_on_hand: 'asc' },
      select: { branch_id: true, quantity_on_hand: true, low_stock_threshold: true },
    });
    expect(rows).toStrictEqual([
      { branch_id: branches.B1, quantity_on_hand: -1, low_stock_threshold: null },
      { branch_id: branches.B3, quantity_on_hand: 3, low_stock_threshold: null },
    ]);
  });

  it('sentTransfer: B1 to B3 carrying 2 Pomade, status SENT; draftTransfer: status DRAFT', async () => {
    const sent = await sentTransfer(t.prisma, {
      from: branches.B1,
      to: branches.B3,
      items: [{ product: products.POMADE, quantity: 2 }],
    });
    const draft = await draftTransfer(t.prisma, {
      from: branches.B1,
      to: branches.B2,
      items: [{ product: products.SHAMPOO, quantity: 1 }],
    });
    const rows = await t.prisma.stock_transfers.findMany({
      where: { id: { in: [sent.transferId, draft.transferId] } },
      select: { id: true, status: true, stock_transfer_items: { select: { quantity_sent: true } } },
    });
    expect(Object.fromEntries(rows.map((row) => [row.id, row.status]))).toStrictEqual({
      [sent.transferId]: 2,
      [draft.transferId]: 1,
    });
    expect(sent.itemIds).toHaveLength(1);
  });

  it('draftPurchase: a Hair colour black line at B3 of 5 x 9,000 = 45,000', async () => {
    const { purchaseId } = await draftPurchase(t.prisma, {
      supplier: suppliers.SHWE_HLA,
      lines: [
        {
          branch: branches.B3,
          product: products.HAIR_COLOUR_BLACK,
          quantity: 5,
          unitCost: 9000n as Mmk,
        },
      ],
    });
    const purchase = await t.prisma.purchases.findUniqueOrThrow({
      where: { id: purchaseId },
      select: {
        status: true,
        total_amount: true,
        purchase_items: { select: { line_total_amount: true } },
      },
    });
    expect(purchase).toStrictEqual({
      status: 1,
      total_amount: 45000n,
      purchase_items: [{ line_total_amount: 45000n }],
    });
  });

  it('countInProgress: an IN_PROGRESS count at B1 listing Shampoo', async () => {
    const { countId } = await countInProgress(t.prisma, {
      branch: branches.B1,
      products: [products.SHAMPOO],
    });
    const count = await t.prisma.stock_counts.findUniqueOrThrow({
      where: { id: countId },
      select: { status: true, stock_count_items: { select: { product_id: true } } },
    });
    expect(count).toStrictEqual({
      status: 1,
      stock_count_items: [{ product_id: products.SHAMPOO }],
    });
  });

  it('openSaleWithProduct: an OPEN sale at B3 with a Pomade line at list price 12,000', async () => {
    const { saleId } = await openSaleWithProduct(t.prisma, {
      branch: branches.B3,
      product: products.POMADE,
      listPrice: 12000n as Mmk,
    });
    const sale = await t.prisma.sales.findUniqueOrThrow({
      where: { id: saleId },
      select: {
        status: true,
        sale_items: { select: { product_id: true, list_price_amount: true, line_type: true } },
      },
    });
    expect(sale).toStrictEqual({
      status: 1,
      sale_items: [{ product_id: products.POMADE, list_price_amount: 12000n, line_type: 2 }],
    });
  });

  it('manualAdjustMovement: a MANUAL_ADJUST at B3 with the Entry error reason', async () => {
    const id = await manualAdjustMovement(t.prisma, {
      branch: branches.B3,
      product: products.POMADE,
      delta: 1,
      reason: stockAdjustmentReasons.ENTRY_ERROR,
    });
    const movement = await t.prisma.stock_movements.findUniqueOrThrow({
      where: { id },
      select: { movement_type: true, quantity_delta: true, adjustment_reason_id: true },
    });
    expect(movement).toStrictEqual({
      movement_type: 8,
      quantity_delta: 1,
      adjustment_reason_id: stockAdjustmentReasons.ENTRY_ERROR,
    });
  });
});
