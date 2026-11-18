import { Injectable } from '@nestjs/common';
import {
  type BookingStatus,
  type CursorPage,
  type Mmk,
  type TimelineEntryDto,
  moneyToWire,
  sumMoney,
  toMmtIso,
} from '@point/shared';

import type { ReadScope } from '../../../common/access/read-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { DisplayNames } from '../../people/index.js';
import { servicesLabel } from '../bookings/services-label.js';
import { CustomerBookingsRepository } from '../repositories/customer-bookings.repository.js';
import { type TimelineCursor, encodeTimelineCursor } from './customer-cursors.js';
import type { ActivityEntry, CustomerActivity } from './customers.js';

// P3.CUS.09 — the customer's bookings, visits and visit-less sales in the caller's read scope, newest
// first, then by id (add-customer-management design D10 · proposal reading 11 · R6). The bookings are
// cut in SQL to `limit` + 1 older than the cursor; the sales side is one customer's sales, cut here.
// The merge keeps `limit` and gives the next cursor from the last entry kept; `total` is null.

type BookingRow = Awaited<ReturnType<CustomerBookingsRepository['timelineEntries']>>[number];
type Source =
  | { readonly at: Date; readonly id: string; readonly booking: BookingRow }
  | { readonly at: Date; readonly id: string; readonly activity: ActivityEntry };

/** Newest first; on the same instant the greater id first (UUIDv7 — proposal reading 11). */
const newestFirst = (a: Source, b: Source): number =>
  b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

@Injectable()
export class CustomerTimeline {
  constructor(
    private readonly bookings: CustomerBookingsRepository,
    private readonly names: DisplayNames,
  ) {}

  async page(
    db: Tx,
    activity: CustomerActivity,
    customerId: string,
    scope: ReadScope,
    before: TimelineCursor | null,
    limit: number,
  ): Promise<CursorPage<TimelineEntryDto>> {
    const older = (entry: { at: Date; id: string }): boolean =>
      before === null ||
      entry.at < before.at ||
      (entry.at.getTime() === before.at.getTime() && entry.id < before.id);
    const bookings = await this.bookings.timelineEntries(db, customerId, scope, before, limit + 1);
    const sales = (await activity.timelineEntries(db, customerId, scope)).filter(older);
    const merged: Source[] = [
      ...bookings.map((booking) => ({ at: booking.starts_at, id: booking.id, booking })),
      ...sales.map((entry) => ({ at: entry.at, id: entry.id, activity: entry })),
    ].sort(newestFirst);
    const kept = merged.slice(0, limit);
    const employeeIds = kept.flatMap((source) =>
      'booking' in source
        ? [source.booking.booked_employee_id]
        : source.activity.type === 'visit'
          ? [source.activity.employee_id]
          : [],
    );
    const names = await this.names.ofEmployees(employeeIds, await this.names.callerLocale());
    const employee = (id: string) => ({ id, display_name: names.get(id) ?? '' });
    const last = kept.at(-1);
    return {
      items: kept.map((source) =>
        'booking' in source
          ? bookingEntry(source.booking, employee)
          : activityEntry(source.activity, employee),
      ),
      next_cursor:
        merged.length > limit && last !== undefined
          ? encodeTimelineCursor({ at: last.at, id: last.id })
          : null,
      total: null,
    };
  }
}

type EmployeeRef = (id: string) => { id: string; display_name: string };

/** `total_amount` = Σ item prices + the transport fee (P3-RULE-05). */
function bookingEntry(row: BookingRow, employee: EmployeeRef): TimelineEntryDto {
  const services = row.booking_items.map((item) => item.services);
  const reason = row.booking_cancel_reasons;
  return {
    type: 'booking',
    id: row.id,
    at: toMmtIso(row.starts_at),
    branch_id: row.branch_id,
    status: row.status as BookingStatus,
    employee: employee(row.booked_employee_id),
    services_label_mm: servicesLabel(services, 'my'),
    services_label_en: servicesLabel(services, 'en'),
    total_amount: moneyToWire(
      sumMoney([
        ...row.booking_items.map((item) => item.unit_price_amount as Mmk),
        (row.transport_fee_amount ?? 0n) as Mmk,
      ]),
    ),
    cancel_reason:
      reason === null
        ? null
        : { name_mm: reason.name_mm, name_en: reason.name_en, system_code: reason.system_code },
  };
}

function activityEntry(entry: ActivityEntry, employee: EmployeeRef): TimelineEntryDto {
  const base = { id: entry.id, at: toMmtIso(entry.at), branch_id: entry.branch_id };
  return entry.type === 'visit'
    ? {
        type: 'visit',
        ...base,
        status: entry.status,
        employee: employee(entry.employee_id),
        receipt_number: entry.receipt_number,
        total_amount: entry.total_amount === null ? null : moneyToWire(entry.total_amount),
      }
    : {
        type: 'sale',
        ...base,
        status: entry.status,
        receipt_number: entry.receipt_number,
        total_amount: moneyToWire(entry.total_amount),
      };
}
