import { Injectable } from '@nestjs/common';
import { type BranchAssignment, type BranchSummary, todayMmt } from '@point/shared';

import type { LoadedTarget } from '../../../common/access/resolvers.js';
import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { AccessRepository } from '../repositories/access.repository.js';
import { AssignmentsRepository } from '../repositories/assignments.repository.js';
import { PeopleRepository } from '../repositories/people.repository.js';

// What other modules may ask about people (add-foundation-auth-access design D1). More reads join
// with the sign-in and /me tasks.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PeopleDirectory {
  constructor(
    private readonly repository: PeopleRepository,
    private readonly access: AccessRepository,
    private readonly clock: Clock,
    private readonly assignments: AssignmentsRepository,
  ) {}

  /**
   * `employees.status` of an employee (EmployeeStatus), read in the caller's transaction; null when
   * there is no such employee (add-schedule-patterns design D1 — P2-RULE-07: shifts only when ACTIVE).
   */
  statusOf(db: Tx, employeeId: string): Promise<number | null> {
    return this.assignments.statusOf(db, employeeId);
  }

  /**
   * The primary branch of an employee today (Myanmar Time): the active assignment with the earliest
   * effective_from, ties by created_at then id; null with no active assignment (API-AUD-01 ·
   * P1-RULE-10 · design D12).
   */
  primaryBranchId(employeeId: string): Promise<string | null> {
    return this.repository.primaryBranchId(employeeId, todayMmt(this.clock.now()));
  }

  /** The employee of a user with the members `/me` shows; null when none exists. */
  employeeProfile(userId: string) {
    return this.repository.employeeProfile(userId);
  }

  /** Branches as `BranchSummary`, ordered by code; every branch when `ids` is undefined. */
  branchSummaries(
    ids?: readonly string[],
    filter: { readonly status?: number } = {},
  ): Promise<BranchSummary[]> {
    return this.repository.branchSummaries(ids, filter);
  }

  /** P1.EMP.06 — every branch assignment of the employee, ended ones included. */
  branchAssignments(employeeId: string): Promise<BranchAssignment[]> {
    return this.repository.branchAssignments(employeeId);
  }

  /** `/me.assigned_branch_ids`: active today, ordered by effective_from, created_at, id. */
  assignedBranchIds(employeeId: string): Promise<string[]> {
    return this.repository.assignedBranchIds(employeeId, todayMmt(this.clock.now()));
  }

  /** The employee of a user (every staff user has one); null when none exists. */
  employeeOfUser(
    userId: string,
  ): Promise<{ id: string; status: number; company_id: string } | null> {
    return this.access.employeeOfUser(userId);
  }

  /** The branches of the employee's assignments active on `onDate` (`YYYY-MM-DD`, Myanmar Time). */
  async activeBranchIds(employeeId: string, onDate: string): Promise<string[]> {
    const rows = await this.access.branchAssignmentsOf(employeeId);
    return [
      ...new Set(
        rows
          .filter(
            (row) =>
              row.effective_from <= onDate &&
              (row.effective_to === null || onDate <= row.effective_to),
          )
          .map((row) => row.branch_id),
      ),
    ].sort();
  }

  /**
   * The P1-RULE-11 target set of an employee (design D11): the branches of the active assignments,
   * `match: 'any'` — an overlap with the caller's grant is enough; an empty set is reached at company
   * scope only. Null for an id that is no employee.
   */
  async employeeTarget(employeeId: string): Promise<LoadedTarget | null> {
    if (!UUID.test(employeeId)) return null;
    const employee = await this.access.employee(employeeId);
    if (employee === null) return null;
    return {
      branch_ids: await this.activeBranchIds(employee.id, todayMmt(this.clock.now())),
      match: 'any',
      id: employee.id,
      employee_id: employee.id,
      user_id: employee.user_id,
    };
  }

  /**
   * The branch of a branch assignment, as the access guard's loader of the route
   * `POST /v1/employees/:id/branches/:assignment_id/end` (design D2). Null for an id that is no
   * assignment; whether it belongs to the employee in the path is the service's check.
   */
  async assignmentTarget(assignmentId: string): Promise<LoadedTarget | null> {
    if (!UUID.test(assignmentId)) return null;
    const branchId = await this.access.assignmentBranch(assignmentId);
    return branchId === null ? null : { branch_ids: [branchId], branch_id: branchId };
  }
}
