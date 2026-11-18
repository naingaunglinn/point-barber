import { Injectable } from '@nestjs/common';
import { BookingStatus, CancelReasonSystemCode } from '@point/shared';

import type { ReadScope } from '../../../common/access/read-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { READ_ROW_CEILING, assertWithinCeiling } from '../../../common/limits.js';

// A customer's bookings as the customer statistics read them (add-customer-management design D1 / D6 ·
// P3-RULE-03): booking owns `bookings` and `booking_cancel_reasons`; the read scope is the booking's
// branch. Nothing here writes.

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
      where: {
        ...where,
        booking_cancel_reasons: { is: { system_code: CancelReasonSystemCode.NO_SHOW } },
      },
    });
    return { cancelled, no_show: noShow };
  }

  /**
   * BOOKED bookings with `starts_at` at or after `now`, soonest first (proposal reading 10). No source
   * caps the list, so it is a ceiling read (CG-PERF-02): more than READ_ROW_CEILING fails loudly.
   */
  async upcoming(
    db: Tx,
    customerId: string,
    scope: ReadScope,
    now: Date,
  ): Promise<UpcomingBookingRow[]> {
    const rows = await db.bookings.findMany({
      where: {
        customer_id: customerId,
        status: BookingStatus.BOOKED,
        starts_at: { gte: now },
        ...atBranches(scope),
      },
      orderBy: [{ starts_at: 'asc' }, { id: 'asc' }],
      select: { id: true, starts_at: true, branch_id: true, booked_employee_id: true },
      take: READ_ROW_CEILING + 1,
    });
    return assertWithinCeiling(rows, 'CustomerBookingsRepository.upcoming');
  }

  /**
   * The customer's bookings in the scope strictly older than `before` (`(starts_at, id)`), newest
   * first, at most `take` — with their items' prices and service names in `sort_order`, the
   * transport fee and the cancel reason (design D10).
   */
  timelineEntries(
    db: Tx,
    customerId: string,
    scope: ReadScope,
    before: { readonly at: Date; readonly id: string } | null,
    take: number,
  ) {
    return db.bookings.findMany({
      where: {
        customer_id: customerId,
        ...atBranches(scope),
        ...(before === null
          ? {}
          : {
              OR: [
                { starts_at: { lt: before.at } },
                { starts_at: before.at, id: { lt: before.id } },
              ],
            }),
      },
      orderBy: [{ starts_at: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        starts_at: true,
        branch_id: true,
        status: true,
        booked_employee_id: true,
        transport_fee_amount: true,
        booking_items: {
          orderBy: { sort_order: 'asc' },
          select: {
            unit_price_amount: true,
            services: { select: { name_mm: true, name_en: true } },
          },
        },
        booking_cancel_reasons: { select: { name_mm: true, name_en: true, system_code: true } },
      },
    });
  }
}
