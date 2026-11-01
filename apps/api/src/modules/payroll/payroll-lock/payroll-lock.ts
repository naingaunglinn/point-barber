import { Injectable } from '@nestjs/common';
import { type BusinessDate, ErrorCode } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { CurrentCompany } from '../../people/index.js';
import { PayrollRunsRepository } from '../repositories/payroll-runs.repository.js';

// PayrollLock — finalized periods are frozen (P5-RULE-10 · API-IDEM-06 · CG-DB-08 · add-walkin-visit-
// checkout design D1). In the one lock order it comes second: day lock → payroll lock → row locks.

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

@Injectable()
export class PayrollLock {
  constructor(
    private readonly repository: PayrollRunsRepository,
    private readonly company: CurrentCompany,
  ) {}

  /**
   * The shared payroll lock, then the runs covering `dates`: a date inside a FINALIZED / PUBLISHED /
   * PAID run → 423 `payroll_finalized { employee_id, run_id, period: { start, end }, status }`, where
   * `employee_id` is the first of `employee_ids`, null when none was passed.
   */
  async assertNotFinalized(
    tx: Tx,
    input: { readonly employee_ids?: readonly string[]; readonly dates: readonly BusinessDate[] },
  ): Promise<void> {
    const companyId = await this.company.id(tx);
    await this.repository.lockPayrollShared(tx, companyId);
    const run = await this.repository.frozenRunCovering(tx, companyId, input.dates);
    if (run === null) return;
    throw new ProblemException(ErrorCode.PAYROLL_FINALIZED, 423, {
      context: {
        employee_id: input.employee_ids?.[0] ?? null,
        run_id: run.id,
        period: { start: isoDate(run.period_start), end: isoDate(run.period_end) },
        status: run.status,
      },
    });
  }
}
