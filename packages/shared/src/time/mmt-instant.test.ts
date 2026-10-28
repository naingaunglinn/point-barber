import { describe, expect, it } from 'vitest';

import { businessDateOf } from './business-date.js';
import { mmtInstant } from './mmt-instant.js';

// add-late-entry task 1.2 — the instant a late-entry date and time field sends (design D2 · D-PLT-15 ·
// API-DATA-03 · CG-TIME-02). The same values pass under every TZ of `test:zones`.
describe('mmtInstant', () => {
  it.each([
    ['2026-10-04', '15:00', '2026-10-04T15:00:00+06:30', '2026-10-04'],
    // Five minutes before midnight is still the 3rd: a late entry lands on the day it names.
    ['2026-10-03', '23:55', '2026-10-03T23:55:00+06:30', '2026-10-03'],
    ['2026-10-04', '00:00', '2026-10-04T00:00:00+06:30', '2026-10-04'],
    // 00:00 MMT is 17:30 UTC of the day before; the date stays the one typed.
    ['2026-11-01', '00:00', '2026-11-01T00:00:00+06:30', '2026-11-01'],
  ])('%s + %s → %s (business date %s)', (date, time, instant, businessDate) => {
    expect(mmtInstant(date, time)).toBe(instant);
    expect(businessDateOf(mmtInstant(date, time))).toBe(businessDate);
  });

  it.each([
    ['2026-10-04', '24:00'],
    ['2026-10-04', '9:30'],
    ['2026-10-04', '09:60'],
    ['2026-10-04', '3:00 PM'],
    ['04/Oct/2026', '15:00'],
    ['2026-02-30', '10:00'],
  ])('refuses %s + %s', (date, time) => {
    expect(() => mmtInstant(date, time)).toThrow(RangeError);
  });
});
