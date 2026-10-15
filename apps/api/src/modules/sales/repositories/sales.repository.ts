import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The sales table (Part 4 — the sales module owns it). Reads and writes of the walk-in flow join here
// as the change builds them.

@Injectable()
export class SalesRepository {
  /** The latest finish time of a customer's FINISHED visit sales at the branches (null = any). */
  async lastVisitFinishedAt(
    db: Tx,
    customerId: string,
    branchIds: readonly string[] | null,
  ): Promise<Date | null> {
    const row = await db.sales.aggregate({
      where: {
        customer_id: customerId,
        status: SaleStatus.FINISHED,
        visit_id: { not: null },
        ...(branchIds === null ? {} : { branch_id: { in: [...branchIds] } }),
      },
      _max: { finished_at: true },
    });
    return row._max.finished_at;
  }
}
