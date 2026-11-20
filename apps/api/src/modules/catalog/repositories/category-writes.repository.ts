import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The writes of `service_categories` (P2.CAT.02 – 05 · ADR-001 rule 1: `catalog` writes its own tables).
// Locks come first and in one order — category, then service (design D4); every check after them.

export interface CategoryRow {
  readonly id: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly sort_order: number;
  readonly status: number;
  readonly archived_at: Date | null;
  readonly updated_at: Date;
}

const SELECT = {
  id: true,
  name_mm: true,
  name_en: true,
  sort_order: true,
  status: true,
  archived_at: true,
  updated_at: true,
} as const;

@Injectable()
export class CategoryWritesRepository {
  /** The category locked `FOR UPDATE` until commit; null when there is none. */
  async lock(tx: Tx, id: string): Promise<CategoryRow | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM service_categories WHERE id = ${id}::uuid FOR UPDATE`;
    return locked.length === 0 ? null : this.row(tx, id);
  }

  /** Every non-archived category of the company, locked `FOR UPDATE` in `id` order (design D4). */
  async lockAllLive(tx: Tx, companyId: string): Promise<readonly string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM service_categories
       WHERE company_id = ${companyId}::uuid AND archived_at IS NULL
       ORDER BY id FOR UPDATE`;
    return rows.map((row) => row.id);
  }

  /** The ids in catalogue order (`sort_order`, `name_mm`, `id`) — the `before` of a reorder. */
  async liveIdsInOrder(tx: Tx, ids: readonly string[]): Promise<readonly string[]> {
    const rows = await tx.service_categories.findMany({
      where: { id: { in: [...ids] } },
      orderBy: [{ sort_order: 'asc' }, { name_mm: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  row(tx: Tx, id: string): Promise<CategoryRow | null> {
    return tx.service_categories.findUnique({ where: { id }, select: SELECT });
  }

  /** The non-archived category of the company with this Myanmar name, other than `exceptId`. */
  async nameTaken(tx: Tx, companyId: string, nameMm: string, exceptId?: string): Promise<boolean> {
    const found = await tx.service_categories.findFirst({
      where: {
        company_id: companyId,
        name_mm: nameMm,
        archived_at: null,
        ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    return found !== null;
  }

  /** Non-archived services of the category, whatever their status (what `category_in_use` counts). */
  liveServiceCount(tx: Tx, categoryId: string): Promise<number> {
    return tx.services.count({ where: { category_id: categoryId, archived_at: null } });
  }

  /** The new row; a name the company already has violates `service_categories_name_active`. */
  insert(
    tx: Tx,
    row: {
      readonly id: string;
      readonly company_id: string;
      readonly name_mm: string;
      readonly name_en: string | null;
      readonly sort_order: number;
      readonly at: Date;
    },
  ): Promise<unknown> {
    const { at, ...members } = row;
    return tx.service_categories.create({
      data: { ...members, status: 1, created_at: at, updated_at: at },
    });
  }

  update(
    tx: Tx,
    id: string,
    members: { name_mm?: string; name_en?: string | null; status?: number; archived_at?: Date },
    at: Date,
  ): Promise<unknown> {
    return tx.service_categories.update({ where: { id }, data: { ...members, updated_at: at } });
  }

  /** `sort_order` = position 1 … n, one statement per row that moved (the rows are already locked). */
  async setPositions(tx: Tx, ids: readonly string[], at: Date): Promise<void> {
    for (const [index, id] of ids.entries()) {
      await tx.service_categories.updateMany({
        where: { id, NOT: { sort_order: index + 1 } },
        data: { sort_order: index + 1, updated_at: at },
      });
    }
  }
}
