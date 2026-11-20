import { BookingStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BookingReads } from '../src/modules/booking/index.js';
import { bookingAt, cancelBooking } from './helpers/branches.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-website-management task 3.3 — BookingReads.bookedInRange (design D1 · D7): the BOOKED bookings of
// a branch whose business date is inside the range, earliest first. A real PostgreSQL, the rows written
// by the test builders. Monday 05/Oct/2026.
const { B1, B3 } = FIXTURE_IDS.branches;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T10:00:00'));
});
afterAll(() => s.close());

describe('add-website-management · booking · BookingReads.bookedInRange', () => {
  it('lists BOOKED bookings of the branch by business date, both ends counted, ordered by starts_at', async () => {
    const late = await bookingAt(s.prisma, B3, BookingStatus.BOOKED, mmt('2026-10-13T16:00:00'));
    const early = await bookingAt(s.prisma, B3, BookingStatus.BOOKED, mmt('2026-10-12T09:00:00'));
    const lastDay = await bookingAt(s.prisma, B3, BookingStatus.BOOKED, mmt('2026-10-13T23:30:00'));
    // Left out: a cancelled one, one a day outside the range, one of another branch, one started.
    const cancelled = await bookingAt(
      s.prisma,
      B3,
      BookingStatus.BOOKED,
      mmt('2026-10-12T11:00:00'),
    );
    await cancelBooking(s.prisma, cancelled, mmt('2026-10-05T10:00:00'));
    await bookingAt(s.prisma, B3, BookingStatus.BOOKED, mmt('2026-10-11T23:30:00'));
    await bookingAt(s.prisma, B3, BookingStatus.BOOKED, mmt('2026-10-14T00:30:00'));
    await bookingAt(s.prisma, B1, BookingStatus.BOOKED, mmt('2026-10-12T12:00:00'));
    await bookingAt(s.prisma, B3, BookingStatus.STARTED, mmt('2026-10-12T13:00:00'));
    const reads = s.app.get(BookingReads);
    const range = { branch_id: B3, from: '2026-10-12', to: '2026-10-13' };
    const rows = await reads.bookedInRange({ ...range, take: 101 });
    expect(rows.map((row) => row.booking_id)).toStrictEqual([early, late, lastDay]);
    expect(rows[0]).toMatchObject({
      employee_id: FIXTURE_IDS.employees.E004,
      customer_name: 'Ma Su',
    });
    expect(rows[0]?.customer_phone).toEqual(expect.stringMatching(/^\+[1-9]\d{6,14}$/));
    expect(await reads.countBookedInRange(range)).toBe(3);
  });

  it('takes at most `take` rows, the earliest first, and counts them all', async () => {
    const reads = s.app.get(BookingReads);
    const range = { branch_id: B3, from: '2026-10-12', to: '2026-10-13' };
    expect(await reads.bookedInRange({ ...range, take: 2 })).toHaveLength(2);
    expect(await reads.countBookedInRange(range)).toBe(3);
    expect(
      await reads.bookedInRange({ ...range, from: '2026-11-01', to: '2026-11-02', take: 5 }),
    ).toStrictEqual([]);
  });
});
