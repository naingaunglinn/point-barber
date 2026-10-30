import { Injectable } from '@nestjs/common';
import { EmployeeStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';

// Branch assignments (Part 1 — the people module owns employees and employee_branches): whether an
// employee is ACTIVE and assigned to a branch on a Myanmar calendar date (both ends inclusive).

@Injectable()
export class AssignmentsRepository {
  async activeAndAssigned(
    db: Tx,
    key: { employee_id: string; branch_id: string; date: string },
  ): Promise<boolean> {
    const day = new Date(`${key.date}T00:00:00Z`);
    const row = await db.employee_branches.findFirst({
      where: {
        employee_id: key.employee_id,
        branch_id: key.branch_id,
        effective_from: { lte: day },
        OR: [{ effective_to: null }, { effective_to: { gte: day } }],
        employees: { status: EmployeeStatus.ACTIVE },
      },
      select: { id: true },
    });
    return row !== null;
  }
}
