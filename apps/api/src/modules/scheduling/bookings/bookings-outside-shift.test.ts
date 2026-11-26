import { describe, expect, it } from 'vitest';

import type { BookedBlock } from './booked-blocks.js';
import type { ActiveShift } from '../repositories/shifts.repository.js';
import { outsideShifts } from './bookings-outside-shift.js';

// add-schedule-patterns task 5.2 — "Shift changes list the bookings left outside the shifts" (P2-RULE-08 ·
// D-BKG-19 · design D8), the pure rule. Ko Aung at B3 (spec-fixtures §2): Ma Su's bookings.
const B1 = '0199a3f2-0000-7000-8001-0000000000b1';
const B3 = '0199a3f2-0000-7000-8001-0000000000b3';
const KO_AUNG = '0199a3f2-0000-7000-8003-00000000e004';
const mmt = (local: string) => new Date(`${local}+06:30`);

const booking = (id: number, date: string, start: string, end: string, branch = B3): BookedBlock => ({
  booking_id: `0199a3f2-0000-7000-8004-00000000000${String(id)}`,
  booked_employee_id: KO_AUNG,
  branch_id: branch,
  status: 1,
  business_date: date,
  starts_at: mmt(`${date}T${start}:00`),
  ends_at: mmt(`${date}T${end}:00`),
  block_starts_at: mmt(`${date}T${start}:00`),
  block_ends_at: mmt(`${date}T${end}:00`),
  customer_name: 'Ma Su',
});
const shift = (date: string, start: string, end: string, branch = B3): ActiveShift => ({
  branch_id: branch,
  shift_date: date,
  starts_at: mmt(`${date}T${start}:00`),
  ends_at: mmt(`${date}T${end}:00`),
});

describe('add-schedule-patterns · scheduling · bookings outside the shifts (pure rule)', () => {
  it('Scenario: Saturday removed — a booking on a day with no shift is listed, in the booking’s own times', () => {
    const warning = outsideShifts([booking(1, '2026-10-17', '16:00', '16:30')], []);
    expect(warning).toStrictEqual({
      code: 'bookings_outside_shift',
      items: [
        {
          booking_id: '0199a3f2-0000-7000-8004-000000000001',
          branch_id: B3,
          starts_at: '2026-10-17T16:00:00+06:30',
          ends_at: '2026-10-17T16:30:00+06:30',
        },
      ],
    });
  });

  it('Scenario: A block that runs past the new end — 18:45 – 19:15 against 10:00 – 19:00 is listed', () => {
    expect(
      outsideShifts([booking(1, '2026-10-13', '18:45', '19:15')], [shift('2026-10-13', '10:00', '19:00')]),
    ).not.toBeNull();
  });

  it('Scenario: A block that ends with the shift — 18:30 – 19:00 against 10:00 – 19:00 is not listed', () => {
    expect(
      outsideShifts([booking(1, '2026-10-13', '18:30', '19:00')], [shift('2026-10-13', '10:00', '19:00')]),
    ).toBeNull();
  });

  it('a block starting before the shift is listed; one starting with it is not', () => {
    const shifts = [shift('2026-10-13', '10:00', '19:00')];
    expect(outsideShifts([booking(1, '2026-10-13', '09:45', '10:15')], shifts)).not.toBeNull();
    expect(outsideShifts([booking(1, '2026-10-13', '10:00', '10:30')], shifts)).toBeNull();
  });

  it('touching shifts of one branch are merged — a block over the join is inside', () => {
    const shifts = [shift('2026-10-13', '09:00', '13:00'), shift('2026-10-13', '13:00', '18:00')];
    expect(outsideShifts([booking(1, '2026-10-13', '12:45', '13:15')], shifts)).toBeNull();
  });

  it('shifts with a gap are not merged — a block over the gap is listed', () => {
    const shifts = [shift('2026-10-13', '09:00', '12:00'), shift('2026-10-13', '13:00', '18:00')];
    expect(outsideShifts([booking(1, '2026-10-13', '11:45', '12:15')], shifts)).not.toBeNull();
  });

  it('only the shifts at the booking’s branch and date count', () => {
    const blocks = [booking(1, '2026-10-13', '10:00', '10:30')];
    expect(outsideShifts(blocks, [shift('2026-10-13', '09:00', '18:00', B1)])).not.toBeNull();
    expect(outsideShifts(blocks, [shift('2026-10-14', '09:00', '18:00')])).not.toBeNull();
  });

  it('lists the bookings in the order of their start', () => {
    const warning = outsideShifts(
      [booking(2, '2026-10-17', '16:00', '16:30'), booking(1, '2026-10-10', '09:00', '09:30')],
      [],
    );
    expect(warning?.items.map((item) => item.starts_at)).toStrictEqual([
      '2026-10-10T09:00:00+06:30',
      '2026-10-17T16:00:00+06:30',
    ]);
  });

  it('is null with no bookings', () => {
    expect(outsideShifts([], [shift('2026-10-13', '09:00', '18:00')])).toBeNull();
  });
});
