import { Injectable } from '@nestjs/common';

// `/me.today_branch_id` (Part 1 §12 · add-foundation-auth-access design D13): the branch of the
// employee's shift today or of their open attendance record. Neither module exists yet, so the
// answer is null; add-schedule-patterns-shifts and add-attendance-clock replace the implementation.
export abstract class TodayBranch {
  abstract of(employeeId: string): Promise<string | null>;
}

@Injectable()
export class NoTodayBranch extends TodayBranch {
  override of(_employeeId: string): Promise<string | null> {
    return Promise.resolve(null);
  }
}
