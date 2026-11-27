import { Injectable } from '@nestjs/common';
import { BranchStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { READ_ROW_CEILING, assertWithinCeiling } from '../../../common/limits.js';

/** A non-archived shift at a public ACTIVE branch. */
export interface ShiftBranchRow {
  readonly employee_id: string;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly branch: {
    readonly id: string;
    readonly code: string;
    readonly name_mm: string;
    readonly name_en: string | null;
  };
}

// The `schedule_shifts` reads of the website (add-website-management design D1 · D8 · P8.WEB.09): the
// scheduling module owns the table.
@Injectable()
export class ShiftsRepository {
  /** The shifts of `employeeIds` on the business date `date` at public ACTIVE branches, by start. */
  async publicBranchShifts(
    db: Tx,
    employeeIds: readonly string[],
    date: string,
  ): Promise<ShiftBranchRow[]> {
    const rows = await db.schedule_shifts.findMany({
      where: {
        employee_id: { in: [...employeeIds] },
        shift_date: new Date(`${date}T00:00:00.000Z`),
        archived_at: null,
        branches: { is_public: true, status: BranchStatus.ACTIVE },
      },
      orderBy: [{ starts_at: 'asc' }, { id: 'asc' }],
      take: READ_ROW_CEILING + 1,
      select: {
        employee_id: true,
        starts_at: true,
        ends_at: true,
        branches: { select: { id: true, code: true, name_mm: true, name_en: true } },
      },
    });
    return assertWithinCeiling(rows, 'TodayShifts.branchesOf').map((row) => ({
      employee_id: row.employee_id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      branch: row.branches,
    }));
  }
}
