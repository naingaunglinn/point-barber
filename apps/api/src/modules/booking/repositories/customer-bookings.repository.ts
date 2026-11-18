import { Injectable } from '@nestjs/common';
import { BookingStatus, LIST_LIMIT_MAX } from '@point/shared';

import type { ReadScope } from '../../../common/access/read-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';

// A customer's bookings as the customer statistics read them (add-customer-management design D1 / D6 ·
// P3-RULE-03): booking owns `bookings` and `booking_cancel_reasons`; the read scope is the booking's
// branch. Nothing here writes.

/** `booking_cancel_reasons.system_code` 1 NO_SHOW (DB Part 3 · D-BKG-17). */
const NO_SHOW = 1;

/** A BOOKED booking from now on (OpenAPI Part 3 `UpcomingBooking`). */
export interface UpcomingBookingRow {
  readonly id: string;
  readonly starts_at: Date;
  readonly branch_id: string;
  readonly booked_employee_id: string;
}

const atBranches = (scope: ReadScope) => (scope === 'all' ? {} : { branch_id: { in: [...scope] } });

@Injectable()
export class CustomerBookingsRepository {
  /**
   * `cancelled` = every CANCELLED booking, whoever cancelled it and with whatever reason; `no_show` =
   * those whose reason is the NO_SHOW row (owner CM2).
   */
  async cancellationCounts(
    db: Tx,
    customerId: string,
    scope: ReadScope,
  ): Promise<{ cancelled: number; no_show: number }> {
    const where = {
      customer_id: customerId,
      status: BookingStatus.CANCELLED,
      ...atBranches(scope),
    };
    const cancelled = await db.bookings.count({ where });
    const noShow = await db.bookings.count({
      where: { ...where, booking_cancel_reasons: { is: { system_code: NO_SHOW } } },
    });
    return { cancelled, no_show: noShow };
  }

  /** BOOKED bookings with `starts_at` at or after `now`, soonest first (proposal reading 10). */
  upcoming(db: Tx, customerId: string, scope: ReadScope, now: Date): Promise<UpcomingBookingRow[]> {
    return db.bookings.findMany({
      where: {
        customer_id: customerId,
        status: BookingStatus.BOOKED,
        starts_at: { gte: now },
        ...atBranches(scope),
      },
      orderBy: [{ starts_at: 'asc' }, { id: 'asc' }],
      select: { id: true, starts_at: true, branch_id: true, booked_employee_id: true },
      take: LIST_LIMIT_MAX,
    });
  }
}
