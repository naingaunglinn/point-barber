import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { READ_ROW_CEILING, assertWithinCeiling } from '../../../common/limits.js';

// The writes of `services` and `branch_services` (P2.SVC.02 / 04 / 05 / 07 · ADR-001 rule 1: `catalog` writes
// its own tables). Locks come first and in one order — category, then service (design D4); every check after.

export interface ServiceRow {
  readonly id: string;
  readonly category_id: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly description_mm: string | null;
  readonly description_en: string | null;
  readonly public_description_mm: string | null;
  readonly public_description_en: string | null;
  readonly pricing_mode: number;
  readonly buffer_minutes: number;
  readonly show_on_website: boolean;
  readonly sort_order: number;
  readonly status: number;
  readonly archived_at: Date | null;
  readonly updated_at: Date;
}

/** The members `update` may change (the audit row shows them as the API words them). */
export interface ServiceChanges {
  category_id?: string;
  name_mm?: string;
  name_en?: string | null;
  description_mm?: string | null;
  description_en?: string | null;
  public_description_mm?: string | null;
  public_description_en?: string | null;
  buffer_minutes?: number;
  show_on_website?: boolean;
  status?: number;
  sort_order?: number;
  archived_at?: Date;
}

const SELECT = {
  id: true,
  category_id: true,
  name_mm: true,
  name_en: true,
  description_mm: true,
  description_en: true,
  public_description_mm: true,
  public_description_en: true,
  pricing_mode: true,
  buffer_minutes: true,
  show_on_website: true,
  sort_order: true,
  status: true,
  archived_at: true,
  updated_at: true,
} as const;

@Injectable()
export class ServiceWritesRepository {
  /** The category locked `FOR SHARE` (blocks an archive that would orphan the new row); null when none. */
  async lockCategory(
    tx: Tx,
    id: string,
  ): Promise<{ readonly id: string; readonly archived_at: Date | null } | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM service_categories WHERE id = ${id}::uuid FOR SHARE`;
    if (locked.length === 0) return null;
    return tx.service_categories.findUnique({
      where: { id },
      select: { id: true, archived_at: true },
    });
  }

  /** The service locked `FOR UPDATE` until commit; null when there is none. */
  async lock(tx: Tx, id: string): Promise<ServiceRow | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM services WHERE id = ${id}::uuid FOR UPDATE`;
    return locked.length === 0 ? null : this.row(tx, id);
  }

  /** The non-archived services of a category, locked `FOR UPDATE` in `id` order (design D4). */
  async lockLiveOfCategory(tx: Tx, categoryId: string): Promise<readonly string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM services
       WHERE category_id = ${categoryId}::uuid AND archived_at IS NULL
       ORDER BY id FOR UPDATE
       LIMIT ${READ_ROW_CEILING + 1}`;
    return assertWithinCeiling(rows, 'ServiceWritesRepository.lockLiveOfCategory').map(
      (row) => row.id,
    );
  }

  /** The ids in catalogue order inside the category (`sort_order`, `name_mm`, `id`) — the `before` of a reorder. */
  async liveIdsInOrder(tx: Tx, ids: readonly string[]): Promise<readonly string[]> {
    const rows = await tx.services.findMany({
      where: { id: { in: [...ids] } },
      orderBy: [{ sort_order: 'asc' }, { name_mm: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: ids.length,
    });
    return rows.map((row) => row.id);
  }

  row(tx: Tx, id: string): Promise<ServiceRow | null> {
    return tx.services.findUnique({ where: { id }, select: SELECT });
  }

  /** The non-archived service of the company with this Myanmar name, other than `exceptId`. */
  async nameTaken(tx: Tx, companyId: string, nameMm: string, exceptId?: string): Promise<boolean> {
    const found = await tx.services.findFirst({
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

  /** The new ACTIVE row; a name the company already has violates `services_name_active`. */
  insert(
    tx: Tx,
    row: {
      readonly id: string;
      readonly company_id: string;
      readonly category_id: string;
      readonly name_mm: string;
      readonly name_en: string | null;
      readonly description_mm: string | null;
      readonly description_en: string | null;
      readonly public_description_mm: string | null;
      readonly public_description_en: string | null;
      readonly pricing_mode: number;
      readonly buffer_minutes: number;
      readonly show_on_website: boolean;
      readonly sort_order: number;
      readonly at: Date;
    },
  ): Promise<unknown> {
    const { at, ...members } = row;
    return tx.services.create({ data: { ...members, status: 1, created_at: at, updated_at: at } });
  }

  /** One `branch_services` row per item: ACTIVE when sold, INACTIVE when listed as not sold. */
  async insertBranches(
    tx: Tx,
    serviceId: string,
    rows: readonly {
      readonly id: string;
      readonly branch_id: string;
      readonly sold: boolean;
      readonly duration_minutes: number;
    }[],
    at: Date,
  ): Promise<void> {
    if (rows.length === 0) return;
    await tx.branch_services.createMany({
      data: rows.map((row) => ({
        id: row.id,
        branch_id: row.branch_id,
        service_id: serviceId,
        duration_minutes: row.duration_minutes,
        status: row.sold ? 1 : 0,
        created_at: at,
        updated_at: at,
      })),
    });
  }

  update(tx: Tx, id: string, members: ServiceChanges, at: Date): Promise<unknown> {
    return tx.services.update({ where: { id }, data: { ...members, updated_at: at } });
  }

  /** `sort_order` = position 1 … n, one statement per row that moved (the rows are already locked). */
  async setPositions(tx: Tx, ids: readonly string[], at: Date): Promise<void> {
    for (const [index, id] of ids.entries()) {
      await tx.services.updateMany({
        where: { id, NOT: { sort_order: index + 1 } },
        data: { sort_order: index + 1, updated_at: at },
      });
    }
  }
}
