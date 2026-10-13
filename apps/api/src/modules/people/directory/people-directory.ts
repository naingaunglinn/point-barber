import { Injectable } from '@nestjs/common';
import { todayMmt } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { PeopleRepository } from '../repositories/people.repository.js';

// What other modules may ask about people (add-foundation-auth-access design D1). More reads join
// with the sign-in and access tasks.
@Injectable()
export class PeopleDirectory {
  constructor(
    private readonly repository: PeopleRepository,
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
}
