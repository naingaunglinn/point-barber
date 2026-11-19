import { Injectable } from '@nestjs/common';
import { type BusinessDate, ErrorCode, todayMmt, toMmtIso } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { DisplayNames } from '../../people/index.js';
import { DailyClosingsRepository } from '../repositories/daily-closings.repository.js';

// DayLock — the one gate of a branch-day (P7-RULE-02 · API-IDEM-06 · CG-DB-08 · add-walkin-visit-
// checkout design D1). It is the first lock of every writer that moves drawer money; `lockExclusive`,
// close and reopen come with add-daily-closing, and until then daily_closings is empty.

export interface ClosedDay {
  readonly closed_at: Date;
  /** The actor shape of Part 4 (design reading of 15/Oct/2026 — P7-RULE-02 gives no shape). */
  readonly closed_by: { readonly user_id: string; readonly display_name: string };
}

@Injectable()
export class DayLock {
  constructor(
    private readonly repository: DailyClosingsRepository,
    private readonly clock: Clock,
    private readonly names: DisplayNames,
  ) {}

  /**
   * A business date after today (MMT) → 422 `date_in_future`, before any lock. Then the shared day
   * lock, then the closing row: CLOSED → 422 `day_closed { branch_id, business_date, closed_at,
   * closed_by, correction_path: "reopen" }`; no row or OPEN → passes, the lock held to commit.
   */
  async assertOpen(tx: Tx, branchId: string, businessDate: BusinessDate): Promise<void> {
    if (businessDate > todayMmt(this.clock.now())) {
      throw new ProblemException(ErrorCode.DATE_IN_FUTURE, 422);
    }
    await this.repository.lockDayShared(tx, branchId, businessDate);
    const closed = await this.closedDay(tx, branchId, businessDate);
    if (closed === null) return;
    throw new ProblemException(ErrorCode.DAY_CLOSED, 422, {
      context: {
        branch_id: branchId,
        business_date: businessDate,
        closed_at: toMmtIso(closed.closed_at),
        closed_by: closed.closed_by,
        correction_path: 'reopen',
      },
    });
  }

  /** Read only, no lock — the quote's `day_closed` for a past date (design D12). */
  async closedDay(db: Tx, branchId: string, businessDate: BusinessDate): Promise<ClosedDay | null> {
    const row = await this.repository.closedRow(db, branchId, businessDate);
    if (row === null) return null;
    const names = await this.names.ofUsers(
      [row.closed_by_user_id],
      await this.names.callerLocale(),
    );
    return {
      closed_at: row.closed_at,
      closed_by: {
        user_id: row.closed_by_user_id,
        display_name: names.get(row.closed_by_user_id) ?? '',
      },
    };
  }
}
