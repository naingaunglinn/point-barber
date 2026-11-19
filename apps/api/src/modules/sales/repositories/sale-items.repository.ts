import { Injectable } from '@nestjs/common';
import { SaleItemLineType } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The lines of a sale (Part 4 — the sales module owns sale_items). A line is a snapshot: a later price
// or name change never alters it (D-SVC-08); a removed line keeps its row (D-DAT-05).

export interface ItemRow {
  readonly id: string;
  readonly sale_id: string;
  readonly sort_order: number;
  readonly line_type: number;
  readonly service_id: string | null;
  readonly service_variant_id: string | null;
  readonly product_id: string | null;
  readonly booking_item_id: string | null;
  readonly performed_by_employee_id: string | null;
  readonly description_mm: string;
  readonly description_en: string | null;
  readonly quantity: number;
  readonly list_price_amount: bigint;
  readonly unit_price_amount: bigint;
  readonly price_override_reason: string | null;
  readonly price_override_by_user_id: string | null;
  readonly line_discount_amount: bigint;
  readonly line_total_amount: bigint | null;
  readonly added_reason: string | null;
  readonly removed_at: Date | null;
  readonly removed_by_user_id: string | null;
  readonly removed_reason: string | null;
}

export interface NewServiceLine {
  readonly id: string;
  readonly sale_id: string;
  readonly service_id: string;
  readonly performed_by_employee_id: string;
  readonly description_mm: string;
  readonly description_en: string | null;
  readonly price_amount: bigint;
  readonly added_reason: string | null;
  readonly at: Date;
}

const ITEM = {
  id: true,
  sale_id: true,
  sort_order: true,
  line_type: true,
  service_id: true,
  service_variant_id: true,
  product_id: true,
  booking_item_id: true,
  performed_by_employee_id: true,
  description_mm: true,
  description_en: true,
  quantity: true,
  list_price_amount: true,
  unit_price_amount: true,
  price_override_reason: true,
  price_override_by_user_id: true,
  line_discount_amount: true,
  line_total_amount: true,
  added_reason: true,
  removed_at: true,
  removed_by_user_id: true,
  removed_reason: true,
} as const;

@Injectable()
export class SaleItemsRepository {
  ofSale(db: Tx, saleId: string): Promise<ItemRow[]> {
    return db.sale_items.findMany({
      where: { sale_id: saleId },
      orderBy: { sort_order: 'asc' },
      select: ITEM,
    });
  }

  /** A SERVICE line, quantity 1, list price = unit price (no override in this change). */
  async insertServiceLine(tx: Tx, line: NewServiceLine): Promise<ItemRow> {
    const last = await tx.sale_items.aggregate({
      where: { sale_id: line.sale_id },
      _max: { sort_order: true },
    });
    return tx.sale_items.create({
      data: {
        id: line.id,
        sale_id: line.sale_id,
        sort_order: (last._max.sort_order ?? 0) + 1,
        line_type: SaleItemLineType.SERVICE,
        service_id: line.service_id,
        performed_by_employee_id: line.performed_by_employee_id,
        description_mm: line.description_mm,
        description_en: line.description_en,
        quantity: 1,
        list_price_amount: line.price_amount,
        unit_price_amount: line.price_amount,
        added_reason: line.added_reason,
        created_at: line.at,
        updated_at: line.at,
      },
      select: ITEM,
    });
  }

  async markRemoved(
    tx: Tx,
    id: string,
    removal: { at: Date; by_user_id: string; reason: string },
  ): Promise<void> {
    await tx.sale_items.update({
      where: { id },
      data: {
        removed_at: removal.at,
        removed_by_user_id: removal.by_user_id,
        removed_reason: removal.reason,
        updated_at: removal.at,
      },
    });
  }
}
