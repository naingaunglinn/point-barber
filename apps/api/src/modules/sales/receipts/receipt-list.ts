import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type ReceiptListItemDto,
  type ReceiptListPageDto,
  type ReceiptListQuery,
  plusDays,
  toMmtIso,
  todayMmt,
} from '@point/shared';
import { z } from 'zod';

import { type ReadScope, inReadScope } from '../../../common/access/read-scope.js';
import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { DisplayNames } from '../../people/index.js';
import {
  type ReceiptPosition,
  type ReceiptRow,
  ReceiptListRepository,
} from '../repositories/receipt-list.repository.js';
import { ReceiptBarbers } from './receipt-barbers.js';

// P4.RCP.04 — the receipts of a branch and business date, newest first, without amounts (add-receipts-list-lookup
// design D1 / D5 · owner RL1 / RL3). Two bounded keyset reads (the sales and the refunds, each on its
// `(branch_id, business_date)` index, `limit + 1` rows) merged here in one tested function; a page never reads
// more than 2 × (limit + 1) rows (CG-PERF-02).

/** How many days back a list reaches (P4.RCP.04 "≤ 7 days back", for every caller). */
export const RECEIPT_LIST_DAYS_BACK = 7;

const RANK = { sale: 0, refund: 1 } as const;

/** Owner RL1: `issued_at` newest first; at one instant a sale before a refund; then the number descending. */
export function compareReceipts(a: ReceiptRow, b: ReceiptRow): number {
  const byTime = b.issued_at.getTime() - a.issued_at.getTime();
  if (byTime !== 0) return byTime;
  const byKind = RANK[a.kind] - RANK[b.kind];
  if (byKind !== 0) return byKind;
  if (a.number === b.number) return 0;
  return a.number < b.number ? 1 : -1;
}

/** The first `take` receipts of the two reads in the order of RL1. */
export function mergeReceipts(
  sales: readonly ReceiptRow[],
  refunds: readonly ReceiptRow[],
  take: number,
): ReceiptRow[] {
  return [...sales, ...refunds].sort(compareReceipts).slice(0, take);
}

// The opaque cursor (API-DATA-08): the last item of the page — its instant, kind and number — as base64url.
const cursorSchema = z.strictObject({
  at: z.iso.datetime(),
  kind: z.enum(['sale', 'refund']),
  number: z.string().min(1).max(40),
});

export function encodeReceiptCursor(item: ReceiptRow): string {
  const cursor = { at: item.issued_at.toISOString(), kind: item.kind, number: item.number };
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeReceiptCursor(cursor: string): ReceiptPosition {
  const invalid = new ProblemException(ErrorCode.VALIDATION, 400, {
    errors: [{ field: 'cursor', code: 'invalid_type' }],
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid;
  }
  const result = cursorSchema.safeParse(parsed);
  if (!result.success) throw invalid;
  return {
    issued_at: new Date(result.data.at),
    kind: result.data.kind,
    number: result.data.number,
  };
}

@Injectable()
export class ReceiptList {
  constructor(
    private readonly repository: ReceiptListRepository,
    private readonly barbers: ReceiptBarbers,
    private readonly names: DisplayNames,
    private readonly clock: Clock,
  ) {}

  async page(db: Tx, scope: ReadScope, query: ReceiptListQuery): Promise<ReceiptListPageDto> {
    const date = this.dateOf(query.date);
    const after = query.cursor === undefined ? undefined : decodeReceiptCursor(query.cursor);
    if (!inReadScope(scope, query.branch_id)) return { items: [], next_cursor: null, total: null };

    const filter = {
      branch_id: query.branch_id,
      business_date: date,
      after,
      take: query.limit + 1,
    };
    const [sales, refunds] = await Promise.all([
      this.repository.salesOfDay(db, filter),
      this.repository.refundsOfDay(db, filter),
    ]);
    const merged = mergeReceipts(sales, refunds, query.limit + 1);
    const rows = merged.slice(0, query.limit);
    const last = rows[rows.length - 1];

    const performers = await this.barbers.of(
      db,
      rows.map((row) => row.sale_id),
      await this.names.callerLocale(),
    );
    const items: ReceiptListItemDto[] = rows.map((row) => ({
      kind: row.kind,
      number: row.number,
      sale_id: row.sale_id,
      refund_id: row.refund_id,
      issued_at: toMmtIso(row.issued_at),
      barbers: [...(performers.get(row.sale_id) ?? [])],
    }));
    return {
      items,
      next_cursor: merged.length > query.limit && last !== undefined ? encodeReceiptCursor(last) : null,
      total: null,
    };
  }

  /** `date` default today (MMT); today − 7 … today, else 400 `validation` on `date` (owner RL3). */
  private dateOf(requested: string | undefined): string {
    const today = todayMmt(this.clock.now());
    const date = requested ?? today;
    if (date > today || date < plusDays(today, -RECEIPT_LIST_DAYS_BACK)) {
      throw new ProblemException(ErrorCode.VALIDATION, 400, {
        errors: [{ field: 'date', code: 'invalid_value' }],
      });
    }
    return date;
  }
}
