import { Injectable } from '@nestjs/common';
import { branchRoom, userRoom } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { DomainEvents } from '../../../common/events/domain-events.js';
import { PeopleDirectory } from '../../people/index.js';
import type { ChangedShift } from './shift-generator.js';

// The realtime events of a shift change (P2-RULE-12 · API-RT-03 · Part 2 §13 · design D3 step 10): per changed
// (employee, branch) one `schedule.changed { branch_id, employee_id, dates: [first, last] }` for the room
// `branch:<id>`, and once for the employee one copy for `user:<user id>` — a user room holds a **user** id,
// never the employee id (API-RT-01). That copy carries `branch_id` when the write touched one branch and
// omits it when it touched several. `rooms` is the top-level member of the event, never inside `payload`;
// the data holds ids and dates only (owner RT-11 = B). The events are collected in the caller's transaction
// and delivered after its commit.

export const SCHEDULE_CHANGED = 'schedule.changed';

const span = (changed: readonly ChangedShift[]): [string, string] => {
  const dates = changed.map((shift) => shift.shift_date).sort();
  return [dates[0] ?? '', dates.at(-1) ?? ''];
};

@Injectable()
export class ScheduleEvents {
  constructor(
    private readonly events: DomainEvents,
    private readonly directory: PeopleDirectory,
  ) {}

  /** Nothing is collected when `changed` is empty. */
  async collect(tx: Tx, employeeId: string, changed: readonly ChangedShift[]): Promise<void> {
    if (changed.length === 0) return;
    const branches = [...new Set(changed.map((shift) => shift.branch_id))].sort();
    for (const branchId of branches) {
      this.events.collect({
        name: SCHEDULE_CHANGED,
        payload: {
          branch_id: branchId,
          employee_id: employeeId,
          dates: span(changed.filter((shift) => shift.branch_id === branchId)),
        },
        rooms: [branchRoom(branchId)],
      });
    }
    const userId = await this.directory.userIdOfEmployee(tx, employeeId);
    if (userId === null) return;
    const [branchId] = branches;
    this.events.collect({
      name: SCHEDULE_CHANGED,
      payload: {
        ...(branches.length === 1 && branchId !== undefined ? { branch_id: branchId } : {}),
        employee_id: employeeId,
        dates: span(changed),
      },
      rooms: [userRoom(userId)],
    });
  }
}
