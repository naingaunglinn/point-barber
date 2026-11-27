import { Injectable } from '@nestjs/common';
import { branchRoom } from '@point/shared';

import { DomainEvents } from '../../../common/events/domain-events.js';
import { BookingOptionsCache } from './booking-options-cache.js';

// What a closure write announces (P8-RULE-12 · Part 8 §15 · API-RT-03 · design D9): inside its
// transaction `schedule.changed` is collected for the branch's room with the closed dates — ids and
// dates only, `rooms` top-level, never in the payload — and after the commit the booking-options cache
// is told to forget the branch. A refusal, a rollback and a write that changes nothing do neither.

export const SCHEDULE_CHANGED = 'schedule.changed';

/** A range of closed business dates, both ends counted. */
export interface ClosedRange {
  readonly start_date: string;
  readonly end_date: string;
}

@Injectable()
export class ClosureEffects {
  constructor(
    private readonly events: DomainEvents,
    private readonly cache: BookingOptionsCache,
  ) {}

  /** One `schedule.changed` per range — an edit that moves the dates names the old and the new one. */
  collect(branchId: string, ranges: readonly ClosedRange[]): void {
    for (const range of ranges) {
      this.events.collect({
        name: SCHEDULE_CHANGED,
        rooms: [branchRoom(branchId)],
        payload: { branch_id: branchId, dates: [range.start_date, range.end_date] },
      });
    }
  }

  /** After the commit: the cached booking options of the branch are stale. */
  committed(branchId: string): void {
    this.cache.clear([branchId]);
  }
}
