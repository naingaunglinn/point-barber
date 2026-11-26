import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import {
  type AssignmentPeriod,
  AssignmentsRepository,
} from '../repositories/assignments.repository.js';

// "ACTIVE and assigned to that branch on the visit date" (P4.VIS.03 · D-AUTH-07 — 422
// not_assigned_to_branch at START, and the collector of a payment — add-walkin-visit-checkout); the
// assignments of a period for the schedule (add-schedule-patterns design D1 · owner PT4).
@Injectable()
export class Assignments {
  constructor(private readonly repository: AssignmentsRepository) {}

  isActiveAndAssigned(
    db: Tx,
    key: { readonly employee_id: string; readonly branch_id: string; readonly date: string },
  ): Promise<boolean> {
    return this.repository.activeAndAssigned(db, key);
  }

  /**
   * The employee's branch assignments overlapping `from` … `to` (Myanmar calendar dates, both
   * inclusive), ended ones included — whatever the employee's status.
   */
  assignmentsOf(
    db: Tx,
    employeeId: string,
    range: { readonly from: string; readonly to: string },
  ): Promise<AssignmentPeriod[]> {
    return this.repository.overlapping(db, { employee_id: employeeId, ...range });
  }

  /** The ids of the employees with an assignment of `branch_id` overlapping `from` … `to`, by id. */
  employeesAt(
    db: Tx,
    key: { readonly branch_id: string; readonly from: string; readonly to: string },
  ): Promise<string[]> {
    return this.repository.employeesAt(db, key);
  }
}
