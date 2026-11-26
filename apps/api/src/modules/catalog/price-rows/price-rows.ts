import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { READ_ROW_CEILING, assertWithinCeiling } from '../../../common/limits.js';

// The one close-as-of-today function for `service_prices` (add-service-catalogue design D6 · P2-RULE-04 #5 ·
// D-SVC-08): archiving a service closes its rows at every branch, selling it no longer at a branch closes that
// branch's rows (`add-option-services` reuses it for a variant or value archive). Nothing is deleted.

/** Which rows: every non-archived row of the service, or only those of one branch. */
export interface PriceRowTarget {
  readonly service_id: string;
  readonly branch_id?: string;
}

/** The rows the call changed — they go into the `after` of the audit row. */
export interface ClosedPriceRows {
  /** Rows that began today or later: withdrawn (`archived_at` = now). */
  readonly archived: readonly string[];
  /** Rows that began before today and were still open: `effective_to` = today. */
  readonly ended: readonly string[];
}

@Injectable()
export class PriceRows {
  /**
   * Closes the target rows as of `today` (a Myanmar date `YYYY-MM-DD`, `todayMmt(clock.now())`), rows locked
   * in `id` order first. A row that began today cannot end yesterday (`service_prices_dates_chk`), so it is
   * archived; a row that ended before today, or ends today, stays as it is. Shrinking a range never overlaps another row.
   */
  async closeAsOfToday(
    tx: Tx,
    target: PriceRowTarget,
    today: string,
    at: Date,
  ): Promise<ClosedPriceRows> {
    const day = new Date(`${today}T00:00:00Z`);
    const scope = {
      service_id: target.service_id,
      archived_at: null,
      ...(target.branch_id === undefined ? {} : { branch_id: target.branch_id }),
    };
    await this.lock(tx, target);
    const begins = await tx.service_prices.findMany({
      where: { ...scope, effective_from: { gte: day } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: READ_ROW_CEILING + 1,
    });
    const open = await tx.service_prices.findMany({
      where: {
        ...scope,
        effective_from: { lt: day },
        OR: [{ effective_to: null }, { effective_to: { gt: day } }],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: READ_ROW_CEILING + 1,
    });
    const archived = assertWithinCeiling(begins, 'PriceRows.closeAsOfToday').map((row) => row.id);
    const ended = assertWithinCeiling(open, 'PriceRows.closeAsOfToday').map((row) => row.id);
    if (archived.length > 0) {
      await tx.service_prices.updateMany({
        where: { id: { in: archived } },
        data: { archived_at: at, updated_at: at },
      });
    }
    if (ended.length > 0) {
      await tx.service_prices.updateMany({
        where: { id: { in: ended } },
        data: { effective_to: day, updated_at: at },
      });
    }
    return { archived, ended };
  }

  /** The target's non-archived rows `FOR UPDATE` in `id` order (design D4), so two closers never interleave. */
  private async lock(tx: Tx, target: PriceRowTarget): Promise<void> {
    await (target.branch_id === undefined
      ? tx.$queryRaw`SELECT id FROM service_prices
                      WHERE service_id = ${target.service_id}::uuid AND archived_at IS NULL
                      ORDER BY id FOR UPDATE`
      : tx.$queryRaw`SELECT id FROM service_prices
                      WHERE service_id = ${target.service_id}::uuid AND archived_at IS NULL
                        AND branch_id = ${target.branch_id}::uuid
                      ORDER BY id FOR UPDATE`);
  }
}
