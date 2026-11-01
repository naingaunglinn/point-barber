import { describe, expect, it } from 'vitest';

import type { OpeningDay } from '../../platform/index.js';
import { openingHoursLine } from './opening-hours-line.js';

// add-walkin-visit-checkout task 9.4 — the footer line of the receipt (AD-RCPT-01 · D-WEB-04 · design
// D10 · sales-checkout spec "The receipt is English with fixed content"): consecutive weekdays with the
// same hours on one line, `Mon–Sun 9:00 AM – 9:00 PM`; a closed day written "Closed"; no rows → no line.
const open = (day_of_week: number, opens_at = '09:00:00', closes_at = '21:00:00'): OpeningDay => ({
  day_of_week,
  is_closed: false,
  opens_at,
  closes_at,
});
const closed = (day_of_week: number): OpeningDay => ({
  day_of_week,
  is_closed: true,
  opens_at: null,
  closes_at: null,
});
const week = (make: (day: number) => OpeningDay) => [1, 2, 3, 4, 5, 6, 7].map(make);
const CLOSED = 'Closed';

describe('openingHoursLine (design D10)', () => {
  it('the fixture week — open 9:00 AM – 9:00 PM every day', () => {
    expect(
      openingHoursLine(
        week((day) => open(day)),
        CLOSED,
      ),
    ).toBe('Mon–Sun 9:00 AM – 9:00 PM');
  });

  it('no rows → no line', () => {
    expect(openingHoursLine([], CLOSED)).toBeNull();
  });

  it('the rows may come in any order', () => {
    expect(openingHoursLine(week((day) => open(day)).reverse(), CLOSED)).toBe(
      'Mon–Sun 9:00 AM – 9:00 PM',
    );
  });

  it('split runs: one line per run of equal hours, Monday first', () => {
    const days = week((day) => (day <= 5 ? open(day) : open(day, '10:00', '18:00')));
    expect(openingHoursLine(days, CLOSED)).toBe(
      'Mon–Fri 9:00 AM – 9:00 PM\nSat–Sun 10:00 AM – 6:00 PM',
    );
  });

  it('a closed day is written "Closed"; a single day has no range', () => {
    const days = week((day) => (day === 1 ? closed(day) : open(day)));
    expect(openingHoursLine(days, CLOSED)).toBe('Mon Closed\nTue–Sun 9:00 AM – 9:00 PM');
  });

  it('consecutive closed days join like open ones', () => {
    const days = week((day) => (day >= 6 ? closed(day) : open(day)));
    expect(openingHoursLine(days, CLOSED)).toBe('Mon–Fri 9:00 AM – 9:00 PM\nSat–Sun Closed');
  });

  it('equal hours that are not consecutive stay on separate lines; Sunday does not wrap to Monday', () => {
    const days = week((day) => (day === 3 ? closed(day) : open(day)));
    expect(openingHoursLine(days, CLOSED)).toBe(
      'Mon–Tue 9:00 AM – 9:00 PM\nWed Closed\nThu–Sun 9:00 AM – 9:00 PM',
    );
  });

  it('a missing weekday breaks the run and prints nothing', () => {
    const days = [open(1), open(2), open(4), open(5)];
    expect(openingHoursLine(days, CLOSED)).toBe(
      'Mon–Tue 9:00 AM – 9:00 PM\nThu–Fri 9:00 AM – 9:00 PM',
    );
  });

  it('times follow AD-FMT-03: the marker once when both ends share it; seconds ignored', () => {
    expect(openingHoursLine([open(7, '13:00:00', '20:30:00')], CLOSED)).toBe('Sun 1:00 – 8:30 PM');
    expect(openingHoursLine([open(6, '00:00', '11:45')], CLOSED)).toBe('Sat 12:00 – 11:45 AM');
  });
});
