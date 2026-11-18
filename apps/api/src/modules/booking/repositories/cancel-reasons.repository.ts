import { Injectable } from '@nestjs/common';
import { CancelReasonSystemCode } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { CANCEL_REASONS_MAX_ROWS } from '../../../common/limits.js';
import type {
  CancelReasonPreset,
  CancelReasonSeedState,
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

/** A reason as the public surface answers it (design D1 — `CancelReasons.find` / `.noShow`). */
export interface CancelReasonRef {
  readonly id: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly requires_note: boolean;
  readonly system_code: number | null;
  readonly status: number;
  readonly archived_at: Date | null;
}

const REF = {
  id: true,
  name_mm: true,
  name_en: true,
  requires_note: true,
  system_code: true,
  status: true,
  archived_at: true,
} as const;

/** The members a PATCH or an archive writes (P3.CRS.03 · P3.CRS.04). */
export interface CancelReasonUpdateMembers {
  readonly name_mm?: string;
  readonly name_en?: string | null;
  readonly requires_note?: boolean;
  readonly status?: number;
  readonly sort_order?: number;
  readonly archived_at?: Date;
}

@Injectable()
export class CancelReasonsRepository {
  /** What the seed planner reads (design D3) — counted in SQL, so no row list and no bound to reach. */
  async seedState(tx: Tx, companyId: string): Promise<CancelReasonSeedState> {
    const reasons = tx.booking_cancel_reasons;
    const company = { company_id: companyId };
    const rows = await reasons.count({ where: company });
    const noShow = { ...company, system_code: CancelReasonSystemCode.NO_SHOW };
    const { _max: max } = await reasons.aggregate({
      where: { ...company, archived_at: null },
      _max: { sort_order: true },
    });
    return {
      rows,
      hasNoShow: (await reasons.count({ where: noShow })) > 0,
      lastSortOrder: max.sort_order ?? 0,
    };
  }

  async insert(
    tx: Tx,
    row: CancelReasonPreset & { readonly id: string; readonly company_id: string },
    at: Date,
  ): Promise<void> {
    await tx.booking_cancel_reasons.create({ data: { ...row, created_at: at, updated_at: at } });
  }

  /**
   * P3.CRS.01 — by `sort_order`, `name_mm`, `id` (design D7); archived rows only when asked; at most
   * CANCEL_REASONS_MAX_ROWS (CG-PERF-02 — a short master list, no paging).
   */
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
      take: CANCEL_REASONS_MAX_ROWS,
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

  /** The company's reason with this id, archived or not (design D1); null when there is none. */
  findRef(db: Tx, companyId: string, id: string): Promise<CancelReasonRef | null> {
    return db.booking_cancel_reasons.findFirst({
      where: { id, company_id: companyId },
      select: REF,
    });
  }

  /** The company's `system_code` 1 row (D-BKG-17 — the base seed adds it); null when there is none. */
  findNoShow(db: Tx, companyId: string): Promise<CancelReasonRef | null> {
    return db.booking_cancel_reasons.findFirst({
      where: { company_id: companyId, system_code: CancelReasonSystemCode.NO_SHOW },
      select: REF,
    });
  }

  /** The company's reason locked FOR UPDATE until commit (design D4); null when there is none. */
  async lockById(tx: Tx, companyId: string, id: string): Promise<CancelReasonRow | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM booking_cancel_reasons
      WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
      FOR UPDATE`;
    return locked.length === 0
      ? null
      : tx.booking_cancel_reasons.findUniqueOrThrow({ where: { id }, select: ROW });
  }

  /**
   * Every non-archived reason of the company locked FOR UPDATE in `id` order (design D4 — reorder), in
   * list order. One more than the bound is read, so a company past it fails the set check.
   */
  async lockActive(tx: Tx, companyId: string): Promise<CancelReasonRow[]> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM booking_cancel_reasons
      WHERE company_id = ${companyId}::uuid AND archived_at IS NULL
      ORDER BY id
      LIMIT ${CANCEL_REASONS_MAX_ROWS + 1}
      FOR UPDATE`;
    return tx.booking_cancel_reasons.findMany({
      where: { id: { in: locked.map((row) => row.id) } },
      orderBy: [{ sort_order: 'asc' }, { name_mm: 'asc' }, { id: 'asc' }],
      select: ROW,
    });
  }

  /** The members given and `updated_at` = `at` (P3.CRS.03 · P3.CRS.04 · P3.CRS.05). */
  update(
    tx: Tx,
    id: string,
    members: CancelReasonUpdateMembers,
    at: Date,
  ): Promise<CancelReasonRow> {
    return tx.booking_cancel_reasons.update({
      where: { id },
      data: { ...members, updated_at: at },
      select: ROW,
    });
  }

  create(tx: Tx, row: CancelReasonInsert, at: Date): Promise<CancelReasonRow> {
    return tx.booking_cancel_reasons.create({
      data: { ...row, created_at: at, updated_at: at },
      select: ROW,
    });
  }
}
