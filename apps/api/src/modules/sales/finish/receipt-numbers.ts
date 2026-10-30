import { Injectable } from '@nestjs/common';
import { formatReceiptNumber } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { sqlStateOf } from '../../../common/database/errors.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { BranchCodes } from '../../people/index.js';

// Gapless receipt numbers (D-PAY-06 · API-IDEM-05 · P4-RULE-18 · add-walkin-visit-checkout design D6):
// the upsert holds the counter row lock until commit, so the FINISH transactions of one branch and
// month take their numbers one after another, and a rollback gives the number back. The lock timeout
// is the only one in the system (system design §3.5): one more try after `55P03`, then the error.

/** The counter step waits at most this long for the row (a build constant — design D6). */
export const RECEIPT_COUNTER_LOCK_TIMEOUT = '5s';

export interface ReceiptNumber {
  readonly number: string;
  readonly year: number;
  readonly month: number;
  readonly seq: number;
}

@Injectable()
export class ReceiptNumbers {
  constructor(
    private readonly branches: BranchCodes,
    private readonly clock: Clock,
  ) {}

  /** The next number of (branch, kind, the business date's year and month). */
  async next(tx: Tx, branchId: string, kind: 1 | 2, businessDate: string): Promise<ReceiptNumber> {
    const year = Number(businessDate.slice(0, 4));
    const month = Number(businessDate.slice(5, 7));
    const code = await this.branches.codeOf(tx, branchId);
    for (let attempt = 1; ; attempt += 1) {
      await tx.$executeRaw`SAVEPOINT receipt_counter`;
      try {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${RECEIPT_COUNTER_LOCK_TIMEOUT}'`);
        const [row] = await tx.$queryRaw<{ last_seq: number }[]>`
          INSERT INTO receipt_counters (branch_id, kind, receipt_year, receipt_month, last_seq, updated_at)
          VALUES (${branchId}::uuid, ${kind}, ${year}, ${month}, 1, ${this.clock.now()})
          ON CONFLICT (branch_id, kind, receipt_year, receipt_month)
          DO UPDATE SET last_seq = receipt_counters.last_seq + 1, updated_at = EXCLUDED.updated_at
          RETURNING last_seq`;
        await tx.$executeRawUnsafe('SET LOCAL lock_timeout = 0');
        await tx.$executeRaw`RELEASE SAVEPOINT receipt_counter`;
        const seq = Number(row?.last_seq);
        return {
          number: formatReceiptNumber({ branchCode: code, kind, year, month, seq }),
          year,
          month,
          seq,
        };
      } catch (error) {
        if (sqlStateOf(error) !== '55P03' || attempt === 2) throw error;
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT receipt_counter`;
      }
    }
  }
}
