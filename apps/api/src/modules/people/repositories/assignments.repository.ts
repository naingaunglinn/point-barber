import { Injectable } from '@nestjs/common';
import { EmployeeStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { READ_ROW_CEILING, assertWithinCeiling } from '../../../common/limits.js';

// Branch assignments (Part 1 — the people module owns employees and employee_branches): whether an
// employee is ACTIVE and assigned to a branch on a Myanmar calendar date (both ends inclusive); the
// assignments overlapping a range and the employee's status (add-schedule-patterns design D1).

/** A branch assignment as a period of Myanmar calendar dates; `effective_to` null = open. */
export interface AssignmentPeriod {
  readonly branch_id: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
}

const dayOf = (date: string): Date => new Date(`${date}T00:00:00Z`);
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

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

  /**
   * The employee's assignments overlapping `from` … `to` (both inclusive), ended ones included,
   * ordered by effective_from, created_at, id. No source caps how many assignments one employee has
   * over time, so the read is bounded by the ceiling and fails loudly above it (CG-PERF-02 · kind C).
   */
  async overlapping(
    db: Tx,
    key: { employee_id: string; from: string; to: string },
  ): Promise<AssignmentPeriod[]> {
    const rows = await db.employee_branches.findMany({
      where: {
        employee_id: key.employee_id,
        effective_from: { lte: dayOf(key.to) },
        OR: [{ effective_to: null }, { effective_to: { gte: dayOf(key.from) } }],
      },
      orderBy: [{ effective_from: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      select: { branch_id: true, effective_from: true, effective_to: true },
      take: READ_ROW_CEILING + 1,
    });
    return assertWithinCeiling(rows, 'AssignmentsRepository.overlapping').map((row) => ({
      branch_id: row.branch_id,
      effective_from: isoDate(row.effective_from),
      effective_to: row.effective_to === null ? null : isoDate(row.effective_to),
    }));
  }

  /** `employees.status` of the employee; null when there is no such employee. */
  async statusOf(db: Tx, employeeId: string): Promise<number | null> {
    const row = await db.employees.findUnique({
      where: { id: employeeId },
      select: { status: true },
    });
    return row?.status ?? null;
  }
}
