import { Injectable } from '@nestjs/common';
import { PayrollRunStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The payroll runs (Part 5 — the payroll module owns payroll_runs). This change only reads them;
// finalize and reopen come with the payroll changes.

export interface FinalizedRun {
  readonly id: string;
  readonly period_start: Date;
  readonly period_end: Date;
  readonly status: number;
}

/** The statuses that freeze a period: FINALIZED, PUBLISHED, PAID (P5-RULE-10). */
const FROZEN = [PayrollRunStatus.FINALIZED, PayrollRunStatus.PUBLISHED, PayrollRunStatus.PAID];

@Injectable()
export class PayrollRunsRepository {
  /**
   * The shared payroll lock (P5-RULE-10): `pg_advisory_xact_lock_shared(hashtextextended('payroll:'
   * || company_id, 0))`, one key per company, held to commit. Finalize and reopen take it exclusive.
   */
  async lockPayrollShared(tx: Tx, companyId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`payroll:${companyId}`}, 0))`;
  }

  /** The first frozen run whose period contains one of `dates` (Myanmar calendar dates). */
  async frozenRunCovering(
    db: Tx,
    companyId: string,
    dates: readonly string[],
  ): Promise<FinalizedRun | null> {
    const days = dates.map((date) => new Date(`${date}T00:00:00Z`));
    return db.payroll_runs.findFirst({
      where: {
        company_id: companyId,
        status: { in: FROZEN },
        OR: days.map((day) => ({ period_start: { lte: day }, period_end: { gte: day } })),
      },
      orderBy: { period_start: 'asc' },
      select: { id: true, period_start: true, period_end: true, status: true },
    });
  }
}
