import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import type { ShiftBranch } from '../../platform/index.js';
import { ShiftsRepository } from '../repositories/shifts.repository.js';

// Where employees work on a business date (add-website-management design D1 · D8 · P8.WEB.09): the rule
// of P8.PUB.04 — the public branches of the non-archived shifts of the day, in shift order. The public
// barbers of add-public-website-pages reuse it.
@Injectable()
export class TodayShifts {
  constructor(private readonly repository: ShiftsRepository) {}

  /** Per employee its public branches on `date` (`YYYY-MM-DD`), by shift start; an employee without a shift is absent. */
  async branchesOf(
    db: Tx,
    query: { readonly employee_ids: readonly string[]; readonly date: string },
  ): Promise<Map<string, ShiftBranch[]>> {
    const rows =
      query.employee_ids.length === 0
        ? []
        : await this.repository.publicBranchShifts(db, query.employee_ids, query.date);
    const byEmployee = new Map<string, ShiftBranch[]>();
    for (const row of rows) {
      const branches = byEmployee.get(row.employee_id) ?? [];
      branches.push({ ...row.branch, starts_at: row.starts_at, ends_at: row.ends_at });
      byEmployee.set(row.employee_id, branches);
    }
    return byEmployee;
  }
}
