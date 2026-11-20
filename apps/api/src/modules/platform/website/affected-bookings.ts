import { Injectable } from '@nestjs/common';
import { type AffectedBooking, WebsiteWarning, toMmtIsoMillis } from '@point/shared';

import { reaches } from '../../../common/access/grant-set.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { ClosureBookings } from './closure-bookings.js';
import { WebsitePeople } from './website-people.js';

// The bookings a saved closure falls on (P8-RULE-12 · owner F8 · owner WM9 = A · design D7): BOOKED
// bookings of the branch with a business date inside the range, earliest first, at most 100 listed.
// Nothing is changed and nothing is sent to a customer (D-CUS-05). The customer's name and phone come
// only with a `booking.*` code that covers the branch — before add-staff-booking (#36) no grant holds
// one, so the customer is never added.

/** The list maximum of API-LIM-03 (owner WM9 = A). */
export const AFFECTED_LIST_MAX = 100;

export interface Affected {
  readonly affected_bookings: AffectedBooking[];
  readonly warnings: { readonly code: string; readonly params: Record<string, number> }[];
}

@Injectable()
export class AffectedBookings {
  constructor(
    private readonly bookings: ClosureBookings,
    private readonly people: WebsitePeople,
  ) {}

  async of(branchId: string, from: string, to: string): Promise<Affected> {
    const range = { branch_id: branchId, from, to };
    // One row more than the list holds tells that the list is cut (CG-PERF-02: every read has a take).
    const rows = await this.bookings.bookedInRange({ ...range, take: AFFECTED_LIST_MAX + 1 });
    if (rows.length === 0) return { affected_bookings: [], warnings: [] };
    const shown = rows.slice(0, AFFECTED_LIST_MAX);
    const total =
      rows.length > AFFECTED_LIST_MAX ? await this.bookings.countBookedInRange(range) : rows.length;
    const names = await this.people.employeeDisplayNames(shown.map((row) => row.employee_id));
    const grants = RequestContext.current()?.grants;
    const customerVisible =
      grants !== undefined && reaches(grants.branchesOfModule('booking'), branchId);
    return {
      affected_bookings: shown.map((row) => ({
        booking_id: row.booking_id,
        starts_at: toMmtIsoMillis(row.starts_at),
        booked_employee: { id: row.employee_id, display_name: names.get(row.employee_id) ?? '' },
        ...(customerVisible
          ? { customer_name: row.customer_name, customer_phone: row.customer_phone }
          : {}),
      })),
      warnings: [
        { code: WebsiteWarning.BOOKINGS_IN_CLOSURE, params: { count: total } },
        ...(total > AFFECTED_LIST_MAX
          ? [{ code: WebsiteWarning.TRUNCATED, params: { shown: AFFECTED_LIST_MAX, total } }]
          : []),
      ],
    };
  }
}
