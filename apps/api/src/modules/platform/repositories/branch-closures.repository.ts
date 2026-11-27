import { Injectable } from '@nestjs/common';
import { businessDateOf } from '@point/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import { READ_ROW_CEILING, assertWithinCeiling } from '../../../common/limits.js';

// The branch_closures table (DB Part 8 v1.1 — the platform module writes it · D-WEB-04 · ADR-001 rule 1):
// the branch of a closure for the access guard's closure loader (task 1.6), and the create, the overlap
// check, the list and the dates a closure covers (add-website-management A3 · design D6).

/** A stored closure; its dates are `YYYY-MM-DD` business dates (D-PLT-15). */
export interface ClosureRow {
  readonly id: string;
  readonly branch_id: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly notice_mm: string;
  readonly notice_en: string | null;
  readonly created_by_user_id: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly archived_at: Date | null;
}

export interface ClosureInsert {
  readonly id: string;
  readonly branch_id: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly notice_mm: string;
  readonly notice_en: string | null;
  readonly created_by_user_id: string;
  readonly now: Date;
}

/** The filter of the list (P8.WEB.05): `from` / `to` select the closures overlapping `[from, to]`. */
export interface ClosureListFilter {
  /** The branches the caller may see; `all` for company scope. */
  readonly branches: { readonly all: boolean; readonly ids: readonly string[] };
  readonly branch_id?: string;
  readonly from?: string;
  readonly to?: string;
  readonly include_archived: boolean;
  /** The id after which the page continues (the cursor). */
  readonly after?: string;
  readonly take: number;
}

// A DATE column arrives as UTC midnight; its Myanmar business date is the same calendar day (CG-TIME-02).
const dateOf = (value: Date): string => businessDateOf(value);
const dateColumn = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

type StoredClosure = {
  id: string;
  branch_id: string;
  start_date: Date;
  end_date: Date;
  notice_mm: string;
  notice_en: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
};

const rowOf = (row: StoredClosure): ClosureRow => ({
  id: row.id,
  branch_id: row.branch_id,
  start_date: dateOf(row.start_date),
  end_date: dateOf(row.end_date),
  notice_mm: row.notice_mm,
  notice_en: row.notice_en,
  created_by_user_id: row.created_by_user_id,
  created_at: row.created_at,
  updated_at: row.updated_at,
  archived_at: row.archived_at,
});

/** The branches a list reads: the one asked for when the caller reaches it, else the caller's own. */
function branchWhere(filter: ClosureListFilter): { branch_id?: string | { in: string[] } } {
  if (filter.branch_id !== undefined) {
    const reached = filter.branches.all || filter.branches.ids.includes(filter.branch_id);
    // A branch outside the caller's grant reads as a list with nothing in it (API-PERM-03).
    return { branch_id: reached ? filter.branch_id : { in: [] } };
  }
  return filter.branches.all ? {} : { branch_id: { in: [...filter.branches.ids] } };
}

@Injectable()
export class BranchClosuresRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  /** The branch of a closure, archived or not; null when no closure has the id. */
  async branchOf(closureId: string): Promise<string | null> {
    const row = await this.db.branch_closures.findUnique({
      where: { id: closureId },
      select: { branch_id: true },
    });
    return row?.branch_id ?? null;
  }

  /** The branch row held `FOR SHARE` for the write (design D6): its code, or null when there is none. */
  async shareBranch(tx: Tx, branchId: string): Promise<{ readonly code: string } | null> {
    const rows = await tx.$queryRaw<{ code: string }[]>`
      SELECT code FROM branches WHERE id = ${branchId}::uuid FOR SHARE`;
    return rows[0] ?? null;
  }

  /** The earliest non-archived closure of the branch sharing a day with `[start, end]`; its id. */
  async overlapping(branchId: string, start: string, end: string): Promise<string | null> {
    const row = await this.db.branch_closures.findFirst({
      where: {
        branch_id: branchId,
        archived_at: null,
        start_date: { lte: dateColumn(end) },
        end_date: { gte: dateColumn(start) },
      },
      orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async insert(tx: Tx, closure: ClosureInsert): Promise<ClosureRow> {
    const row = await tx.branch_closures.create({
      data: {
        id: closure.id,
        branch_id: closure.branch_id,
        start_date: dateColumn(closure.start_date),
        end_date: dateColumn(closure.end_date),
        notice_mm: closure.notice_mm,
        notice_en: closure.notice_en,
        created_by_user_id: closure.created_by_user_id,
        created_at: closure.now,
        updated_at: closure.now,
      },
    });
    return rowOf(row);
  }

  /** One page of the list: `start_date`, then the branch code, then id; `take` rows after the cursor. */
  async list(filter: ClosureListFilter): Promise<ClosureRow[]> {
    const rows = await this.db.branch_closures.findMany({
      where: {
        ...branchWhere(filter),
        ...(filter.include_archived ? {} : { archived_at: null }),
        ...(filter.to === undefined ? {} : { start_date: { lte: dateColumn(filter.to) } }),
        ...(filter.from === undefined ? {} : { end_date: { gte: dateColumn(filter.from) } }),
      },
      orderBy: [{ start_date: 'asc' }, { branches: { code: 'asc' } }, { id: 'asc' }],
      ...(filter.after === undefined ? {} : { cursor: { id: filter.after }, skip: 1 }),
      take: filter.take,
    });
    return rows.map(rowOf);
  }

  /** The non-archived closures of the branches touching `[from, to]` (a ceiling read — CG-PERF-02). */
  async touching(branchIds: readonly string[], from: string, to: string): Promise<ClosureRow[]> {
    const rows = await this.db.branch_closures.findMany({
      where: {
        branch_id: { in: [...branchIds] },
        archived_at: null,
        start_date: { lte: dateColumn(to) },
        end_date: { gte: dateColumn(from) },
      },
      orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
      take: READ_ROW_CEILING + 1,
    });
    return assertWithinCeiling(rows, 'BranchClosures.onDates').map(rowOf);
  }

  /**
   * Per branch of `branchIds` the earliest non-archived closure with `end_date` ≥ `today` (P8.WEB.01
   * `next_closure` — proposal reading 9): `start_date`, then id, decides a tie.
   */
  async nextOf(branchIds: readonly string[], today: string): Promise<Map<string, ClosureRow>> {
    const rows = await this.db.branch_closures.findMany({
      where: {
        branch_id: { in: [...branchIds] },
        archived_at: null,
        end_date: { gte: dateColumn(today) },
      },
      orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
      take: READ_ROW_CEILING + 1,
    });
    const next = new Map<string, ClosureRow>();
    for (const row of assertWithinCeiling(rows, 'BranchClosuresRepository.nextOf').map(rowOf)) {
      if (!next.has(row.branch_id)) next.set(row.branch_id, row);
    }
    return next;
  }
}
