import { Injectable } from '@nestjs/common';
import { DailyClosingStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The closing rows of a branch-day (Part 7 — the cash-closing module owns daily_closings). This
// change only reads them; close and reopen come with add-daily-closing.

export interface ClosedRow {
  readonly closed_at: Date;
  readonly closed_by_user_id: string;
}

const dayKey = (branchId: string, businessDate: string): string =>
  `day:${branchId}:${businessDate}`;

@Injectable()
export class DailyClosingsRepository {
  /**
   * The shared day lock (P7-RULE-02): `pg_advisory_xact_lock_shared(hashtextextended('day:' ||
   * branch_id || ':' || business_date, 0))`, held to commit, so a close cannot slip in between a
   * writer's check and its write. The exclusive form is the close's (add-daily-closing).
   */
  async lockDayShared(tx: Tx, branchId: string, businessDate: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${dayKey(branchId, businessDate)}, 0))`;
  }

  /** The closing of a CLOSED branch-day; null for an OPEN day or a day without a row. */
  async closedRow(db: Tx, branchId: string, businessDate: string): Promise<ClosedRow | null> {
    const row = await db.daily_closings.findUnique({
      where: {
        branch_id_business_date: {
          branch_id: branchId,
          business_date: new Date(`${businessDate}T00:00:00Z`),
        },
      },
      select: { status: true, closed_at: true, closed_by_user_id: true },
    });
    if (row?.status !== DailyClosingStatus.CLOSED) return null;
    // daily_closings_status_fields_chk: a CLOSED row has both.
    if (row.closed_at === null || row.closed_by_user_id === null) {
      throw new Error('A CLOSED daily_closings row without closed_at / closed_by_user_id');
    }
    return { closed_at: row.closed_at, closed_by_user_id: row.closed_by_user_id };
  }
}
