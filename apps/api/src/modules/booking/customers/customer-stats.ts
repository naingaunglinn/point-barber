import { Injectable } from '@nestjs/common';
import { type CustomerDto, type CustomerStatsDto, moneyToWire, toMmtIso } from '@point/shared';

import type { ReadScope } from '../../../common/access/read-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { DisplayNames } from '../../people/index.js';
import { SettingsReader } from '../../platform/index.js';
import { CustomerBookingsRepository } from '../repositories/customer-bookings.repository.js';
import type { CustomerActivity } from './customers.js';
import { pickPreferred } from './preferred-barber.js';

// The customer's statistics and upcoming bookings in the caller's read scope (P3.CUS.04 · P3-RULE-03 ·
// add-customer-management design D6): computed on every read, never stored, no lock. The figures of
// sales come through the CustomerActivity port, the booking counts from booking's own table, the
// preferred barber from the two company settings and the pure rule of D-CUS-08.

const WINDOW = 'customer.preferred_barber_window';
const MIN_VISITS = 'customer.preferred_barber_min_visits';

@Injectable()
export class CustomerStats {
  constructor(
    private readonly bookings: CustomerBookingsRepository,
    private readonly settings: SettingsReader,
    private readonly names: DisplayNames,
  ) {}

  async of(
    db: Tx,
    activity: CustomerActivity,
    customerId: string,
    scope: ReadScope,
    now: Date,
  ): Promise<{ stats: CustomerStatsDto; upcoming: CustomerDto['upcoming_bookings'] }> {
    const totals = await activity.totals(db, customerId, scope);
    const counts = await this.bookings.cancellationCounts(db, customerId, scope);
    const settings = await this.settings.effective([WINDOW, MIN_VISITS]);
    const recent = await activity.recentVisits(db, customerId, scope, settings[WINDOW]);
    const preferred = pickPreferred(recent, settings[MIN_VISITS]);
    const upcoming = await this.bookings.upcoming(db, customerId, scope, now);
    const names =
      preferred === null
        ? new Map<string, string>()
        : await this.names.ofEmployees([preferred], await this.names.callerLocale());
    return {
      stats: {
        visit_count: totals.visit_count,
        total_spent_amount: moneyToWire(totals.total_spent_amount),
        last_visit_at: totals.last_visit_at === null ? null : toMmtIso(totals.last_visit_at),
        no_show_count: counts.no_show,
        cancelled_count: counts.cancelled,
        preferred_employee:
          preferred === null ? null : { id: preferred, display_name: names.get(preferred) ?? '' },
        scope_note: scope === 'all' ? 'company' : 'read_scope',
      },
      upcoming: upcoming.map((booking) => ({
        id: booking.id,
        starts_at: toMmtIso(booking.starts_at),
        branch_id: booking.branch_id,
        booked_employee_id: booking.booked_employee_id,
      })),
    };
  }
}
