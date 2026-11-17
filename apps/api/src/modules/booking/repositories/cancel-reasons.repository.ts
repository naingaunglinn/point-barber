import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import type {
  CancelReasonPreset,
  ExistingCancelReason,
} from '../cancel-reasons/cancel-reason-presets.js';

// Table `booking_cancel_reasons` (DB Part 3 v3 — F-BK-17), written only by `booking` (ADR-001 rule 1 ·
// add-booking-cancel-reasons design D1): the base seed, the P3.CRS reads and writes.

/** A stored reason as the P3.CRS answers read it (design D7). */
export interface CancelReasonRow {
  readonly id: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly requires_note: boolean;
  readonly system_code: number | null;
  readonly sort_order: number;
  readonly status: number;
  readonly archived_at: Date | null;
  readonly updated_at: Date;
}

const ROW = {
  id: true,
  name_mm: true,
  name_en: true,
  requires_note: true,
  system_code: true,
  sort_order: true,
  status: true,
  archived_at: true,
  updated_at: true,
} as const;

/** The members a create stores (P3.CRS.02). */
export interface CancelReasonInsert {
  readonly id: string;
  readonly company_id: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly requires_note: boolean;
  readonly system_code: number | null;
  readonly sort_order: number;
  readonly status: number;
}

@Injectable()
export class CancelReasonsRepository {
  /** What the seed planner reads of every row of the company, archived rows included (design D3). */
  seedState(tx: Tx, companyId: string): Promise<ExistingCancelReason[]> {
    return tx.booking_cancel_reasons.findMany({
      where: { company_id: companyId },
      select: { system_code: true, sort_order: true, archived_at: true },
    });
  }

  async insert(
    tx: Tx,
    row: CancelReasonPreset & { readonly id: string; readonly company_id: string },
    at: Date,
  ): Promise<void> {
    await tx.booking_cancel_reasons.create({ data: { ...row, created_at: at, updated_at: at } });
  }

  /** P3.CRS.01 — by `sort_order`, `name_mm`, `id` (design D7); archived rows only when asked. */
  list(
    db: Tx,
    companyId: string,
    filter: { readonly status: readonly number[]; readonly includeArchived: boolean },
  ): Promise<CancelReasonRow[]> {
    return db.booking_cancel_reasons.findMany({
      where: {
        company_id: companyId,
        status: { in: [...filter.status] },
        ...(filter.includeArchived ? {} : { archived_at: null }),
      },
      orderBy: [{ sort_order: 'asc' }, { name_mm: 'asc' }, { id: 'asc' }],
      select: ROW,
    });
  }

  /** A non-archived reason of the company with this Myanmar name, other than `exceptId` (D6). */
  async nameTaken(tx: Tx, companyId: string, nameMm: string, exceptId?: string): Promise<boolean> {
    const found = await tx.booking_cancel_reasons.findFirst({
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

  /** The highest `sort_order` of the non-archived reasons + 1, or 1 (owner CR1 · design D4). */
  async nextSortOrder(tx: Tx, companyId: string): Promise<number> {
    const { _max: max } = await tx.booking_cancel_reasons.aggregate({
      where: { company_id: companyId, archived_at: null },
      _max: { sort_order: true },
    });
    return (max.sort_order ?? 0) + 1;
  }

  create(tx: Tx, row: CancelReasonInsert, at: Date): Promise<CancelReasonRow> {
    return tx.booking_cancel_reasons.create({
      data: { ...row, created_at: at, updated_at: at },
      select: ROW,
    });
  }
}
