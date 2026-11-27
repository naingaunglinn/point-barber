import { Injectable } from '@nestjs/common';
import { businessDateOf } from '@point/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import { READ_ROW_CEILING, assertWithinCeiling } from '../../../common/limits.js';

// The branch_closures table (DB Part 8 v1.1 — the platform module writes it · D-WEB-04 · ADR-001 rule 1):
// the branch of a closure for the access guard's closure loader (task 1.6), and the create, the overlap
// check, the list and the dates a closure covers (add-website-management A3 · design D6), and the locked
// read, the edit and the archive of a closure (A4).

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

/** What an edit changes of a closure; a member left out stays as it is. */
export interface ClosureChange {
  readonly start_date?: string;
  readonly end_date?: string;
  readonly notice_mm?: string;
  readonly notice_en?: string | null;
  readonly now: Date;
}

/** A closure read for a write, with the branch's code (the cache tag `branch:<code>`). */
export interface LockedClosure {
  readonly closure: ClosureRow;
  readonly branch_code: string;
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

  /**
   * The closure for an edit or an archive, held `FOR UPDATE` until the transaction ends (design D6),
   * with its branch's code; null when no closure has the id.
   */
  async lockForUpdate(tx: Tx, closureId: string): Promise<LockedClosure | null> {
    await tx.$queryRaw`SELECT id FROM branch_closures WHERE id = ${closureId}::uuid FOR UPDATE`;
    const row = await tx.branch_closures.findUnique({
      where: { id: closureId },
      include: { branches: { select: { code: true } } },
    });
    return row === null ? null : { closure: rowOf(row), branch_code: row.branches.code };
  }

  /** The earliest non-archived closure of the branch sharing a day with `[start, end]`; its id. */
  async overlapping(
    branchId: string,
    start: string,
    end: string,
    exceptId?: string,
  ): Promise<string | null> {
    const row = await this.db.branch_closures.findFirst({
      where: {
        branch_id: branchId,
        archived_at: null,
        ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
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

  /** The members of `change` that are set, and `updated_at` = the clock. */
  async update(tx: Tx, closureId: string, change: ClosureChange): Promise<ClosureRow> {
    const row = await tx.branch_closures.update({
      where: { id: closureId },
      data: {
        ...(change.start_date === undefined ? {} : { start_date: dateColumn(change.start_date) }),
        ...(change.end_date === undefined ? {} : { end_date: dateColumn(change.end_date) }),
        ...(change.notice_mm === undefined ? {} : { notice_mm: change.notice_mm }),
        ...(change.notice_en === undefined ? {} : { notice_en: change.notice_en }),
        updated_at: change.now,
      },
    });
    return rowOf(row);
  }

  /** Delete = archive (D-DAT-05): `archived_at` and `updated_at` = the clock. */
  async archive(tx: Tx, closureId: string, now: Date): Promise<ClosureRow> {
    const row = await tx.branch_closures.update({
      where: { id: closureId },
      data: { archived_at: now, updated_at: now },
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
}
