import { BookingStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BookedBlocks } from '../src/modules/booking/bookings/booked-blocks.js';
import { bookingAt } from './builders/bookings.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-schedule-patterns task 5.1 — the booking side of `BookedBlocksPort` (design D1 · D8): the BOOKED rows
// of one employee on the given dates, one row type `BookedBlock`. A STARTED or a CANCELLED row, another
// date and another barber's booking are not returned. Ma Su's bookings with Ko Aung at B3 (spec-fixtures §2).
const { B3 } = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
let booked: string;
let otherDate: string;
let started: string;
let cancelled: string;
let minsBooking: string;

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T11:00:00'));
  booked = await bookingAt(s.prisma, {
    branch: B3,
    status: BookingStatus.BOOKED,
    startsAt: mmt('2026-10-17T16:00:00'),
  });
  otherDate = await bookingAt(s.prisma, {
    branch: B3,
    status: BookingStatus.BOOKED,
    startsAt: mmt('2026-10-18T10:00:00'),
  });
  started = await bookingAt(s.prisma, {
    branch: B3,
    status: BookingStatus.STARTED,
    startsAt: mmt('2026-10-17T11:00:00'),
  });
  cancelled = await bookingAt(s.prisma, {
    branch: B3,
    status: BookingStatus.CANCELLED,
    startsAt: mmt('2026-10-17T12:00:00'),
  });
  minsBooking = await bookingAt(s.prisma, {
    branch: B3,
    status: BookingStatus.BOOKED,
    startsAt: mmt('2026-10-17T13:00:00'),
    employee: 'E005',
  });
});
afterAll(() => s.close());

describe('add-schedule-patterns · booking · BookedBlocks.forEmployeeDates (BookedBlocksPort)', () => {
  it('returns the BOOKED rows of the employee on the dates — not a STARTED, a CANCELLED, another date or another barber', async () => {
    const blocks = await s.app
      .get(BookedBlocks)
      .forEmployeeDates(s.prisma, { employee_id: E.E004, dates: ['2026-10-17'] });
    expect(blocks.map((block) => block.booking_id)).toStrictEqual([booked]);
    expect([started, cancelled, otherDate, minsBooking]).not.toContain(blocks[0]?.booking_id);
  });

  it('carries the BookedBlock row of design D1', async () => {
    const [block] = await s.app
      .get(BookedBlocks)
      .forEmployeeDates(s.prisma, { employee_id: E.E004, dates: ['2026-10-17'] });
    expect(block).toStrictEqual({
      booking_id: booked,
      booked_employee_id: E.E004,
      branch_id: B3,
      status: 1,
      business_date: '2026-10-17',
      starts_at: mmt('2026-10-17T16:00:00'),
      ends_at: mmt('2026-10-17T16:30:00'),
      block_starts_at: mmt('2026-10-17T16:00:00'),
      block_ends_at: mmt('2026-10-17T16:30:00'),
      customer_name: 'Ma Su',
    });
  });

  it('reads several dates in the order of the start, and none for no dates', async () => {
    const port = s.app.get(BookedBlocks);
    const many = await port.forEmployeeDates(s.prisma, {
      employee_id: E.E004,
      dates: ['2026-10-18', '2026-10-17'],
    });
    expect(many.map((block) => block.booking_id)).toStrictEqual([booked, otherDate]);
    expect(await port.forEmployeeDates(s.prisma, { employee_id: E.E004, dates: [] })).toStrictEqual(
      [],
    );
  });
});
