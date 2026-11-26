import { BookingStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bookingAt } from './builders/bookings.js';
import { generateUnit } from './helpers/schedule-shifts.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-schedule-patterns task 5.2 (tests first) — "Shift changes list the bookings left outside the shifts"
// (D-BKG-19 · P2-RULE-08 · AD-SCH-02 · design D8): after a save's regeneration the response carries
// `bookings_outside_shift` for every BOOKED booking of the employee on a changed date whose block is not
// inside the union of the employee's shifts at the booking's branch. Ma Su's bookings with Ko Aung at B3,
// Ma Hnin's saves from `2026-10-12`, clock 05/Oct/2026 11:00 AM, Ko Aung's nightly shifts 09:00 – 21:00.
const { B3 } = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const save = async (who: FixturePerson, employeeId: string, body: object) =>
  s.http
    .put(`/api/v1/employees/${employeeId}/schedule-pattern`)
    .set('Cookie', (await s.signIn(who)).cookie)
    .send(body);
const week = (days: number[], start: string, end: string) =>
  days.map((day_of_week) => ({
    day_of_week,
    segments: [{ branch_id: B3, start_time: start, end_time: end }],
  }));
const bookingRow = (id: string) =>
  s.prisma.bookings.findUniqueOrThrow({
    where: { id },
    select: { status: true, starts_at: true, ends_at: true, block_starts_at: true, updated_at: true },
  });
const booked = (startsAt: string, employee: FixturePerson = 'E004') =>
  bookingAt(s.prisma, { branch: B3, status: BookingStatus.BOOKED, startsAt: mmt(startsAt), employee });

describe('add-schedule-patterns · scheduling · Saturday removed', () => {
  let saturday: string;
  let tuesday: string;
  let before: Awaited<ReturnType<typeof bookingRow>>;

  beforeAll(async () => {
    s = await seededApp(mmt('2026-10-05T11:00:00'));
    await generateUnit(s, E.E004);
    saturday = await booked('2026-10-17T16:00:00');
    tuesday = await booked('2026-10-13T10:00:00');
    await booked('2026-10-17T16:00:00', 'E005');
    before = await bookingRow(saturday);
  });
  afterAll(() => s.close());

  it('Scenario: Saturday removed — warnings hold bookings_outside_shift with that booking only', async () => {
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: week([1, 2, 3, 4, 5], '09:00', '21:00'),
    });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toStrictEqual([
      {
        code: 'bookings_outside_shift',
        items: [
          {
            booking_id: saturday,
            branch_id: B3,
            starts_at: '2026-10-17T16:00:00+06:30',
            ends_at: '2026-10-17T16:30:00+06:30',
          },
        ],
      },
    ]);
  });

  it('the booking stays 1 BOOKED with the same times, and a booking inside the new shifts is not listed', async () => {
    expect(await bookingRow(saturday)).toStrictEqual(before);
    expect((await bookingRow(tuesday)).status).toBe(BookingStatus.BOOKED);
  });

  it('a save that changes no shift answers no warning', async () => {
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: week([1, 2, 3, 4, 5], '09:00', '21:00'),
    });
    expect([res.status, res.body.warnings]).toStrictEqual([200, []]);
  });
});

describe('add-schedule-patterns · scheduling · the block against the new end of the shift', () => {
  let runsPast: string;
  let endsWith: string;

  beforeAll(async () => {
    s = await seededApp(mmt('2026-10-05T11:00:00'));
    await generateUnit(s, E.E004);
    runsPast = await booked('2026-10-13T18:45:00');
    endsWith = await booked('2026-10-14T18:30:00');
  });
  afterAll(() => s.close());

  it('Scenario: A block that runs past the new end is listed (19:15 > 19:00); one that ends with the shift is not', async () => {
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: week([1, 2, 3, 4, 5, 6], '10:00', '19:00'),
    });
    expect(res.status).toBe(200);
    const [warning, ...rest] = res.body.warnings as {
      code: string;
      items: { booking_id: string }[];
    }[];
    expect(rest).toStrictEqual([]);
    expect(warning?.code).toBe('bookings_outside_shift');
    expect(warning?.items.map((item) => item.booking_id)).toStrictEqual([runsPast]);
    expect(warning?.items.map((item) => item.booking_id)).not.toContain(endsWith);
  });
});
