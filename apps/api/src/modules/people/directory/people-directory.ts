import { Injectable } from '@nestjs/common';
import { todayMmt } from '@point/shared';

import type { LoadedTarget } from '../../../common/access/resolvers.js';
import { Clock } from '../../../common/clock/clock.js';
import { AccessRepository } from '../repositories/access.repository.js';
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
  ) {}

  /**
   * The primary branch of an employee today (Myanmar Time): the active assignment with the earliest
   * effective_from, ties by created_at then id; null with no active assignment (API-AUD-01 ·
   * P1-RULE-10 · design D12).
   */
  primaryBranchId(employeeId: string): Promise<string | null> {
    return this.repository.primaryBranchId(employeeId, todayMmt(this.clock.now()));
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
}
