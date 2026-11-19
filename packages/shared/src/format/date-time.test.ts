import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateTime,
  formatTime,
  formatTimeRange,
  formatWeekday,
} from './date-time.js';

// ui-foundation · "Dates and times are formatted in Myanmar Time whatever the device time zone is"
// (D-PLT-05 · D-PLT-15 · AD-FMT-02 · AD-FMT-03 · API-DATA-03). Run under three zones by test:zones.
describe('formatDateTime', () => {
  it.each(['en', 'my'] as const)('Scenario: FINISH time of the fixture sale — %s', (locale) => {
    expect(formatDateTime('2026-10-05T10:42:00+06:30', { locale })).toBe('05/Oct/2026 10:42 AM');
  });

  it('Scenario: Day boundary on a device in another time zone', () => {
    expect(formatDateTime('2026-10-05T17:29:00Z', { locale: 'en' })).toBe('05/Oct/2026 11:59 PM');
    expect(formatDateTime('2026-10-05T17:30:00Z', { locale: 'en' })).toBe('06/Oct/2026 12:00 AM');
  });

  it('Scenario: Month boundary', () => {
    expect(formatDateTime('2026-10-31T23:59:00+06:30', { locale: 'en' })).toBe(
      '31/Oct/2026 11:59 PM',
    );
    expect(formatDateTime('2026-11-01T00:00:00+06:30', { locale: 'en' })).toBe(
      '01/Nov/2026 12:00 AM',
    );
  });
});

describe('formatDate', () => {
  it('a business date is a calendar date — no zone conversion', () => {
    expect(formatDate('2026-10-05', { locale: 'en' })).toBe('05/Oct/2026');
    expect(formatDate('2026-09-30', { locale: 'my' })).toBe('30/Sep/2026');
  });

  it('an instant is shown on its Myanmar date', () => {
    expect(formatDate('2026-10-04T17:30:00Z', { locale: 'en' })).toBe('05/Oct/2026');
  });

  it('Scenario: Weekday word', () => {
    expect(formatDate('2026-10-05', { locale: 'en', weekday: true })).toBe('Mon, 05/Oct/2026');
    expect(formatDate('2026-10-06', { locale: 'my', weekday: true })).toBe('အင်္ဂါ, 06/Oct/2026');
    expect(formatDate('2026-10-11', { locale: 'en', weekday: true })).toBe('Sun, 11/Oct/2026');
  });

  it('writes every month with the fixed English abbreviation', () => {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    months.forEach((month, index) => {
      const mm = String(index + 1).padStart(2, '0');
      expect(formatDate(`2026-${mm}-01`, { locale: 'my' })).toBe(`01/${month}/2026`);
    });
  });

  it('refuses a date that does not exist', () => {
    expect(() => formatDate('2026-02-31', { locale: 'en' })).toThrow(RangeError);
  });
});

describe('formatWeekday', () => {
  it('ISO day_of_week, Monday first', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((day) => formatWeekday(day, { locale: 'en' }))).toStrictEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
  });

  it('refuses a number that is not a weekday', () => {
    for (const day of [0, 8, 1.5])
      expect(() => formatWeekday(day, { locale: 'en' })).toThrow(RangeError);
  });
});

describe('formatTime', () => {
  it.each([
    ['00:00', '12:00 AM'],
    ['09:00', '9:00 AM'],
    ['12:00', '12:00 PM'],
    ['14:30', '2:30 PM'],
    ['21:00', '9:00 PM'],
  ])('Scenario: Times of day from the wire — %s → %s', (wire, text) => {
    expect(formatTime(wire, { locale: 'en' })).toBe(text);
    expect(formatTime(wire, { locale: 'my' })).toBe(text);
  });

  it('an instant is shown in Myanmar Time, without seconds or a zone label', () => {
    expect(formatTime('2026-10-05T08:00:45Z', { locale: 'en' })).toBe('2:30 PM');
  });
});

describe('formatTimeRange', () => {
  it('Scenario: Time range', () => {
    expect(formatTimeRange('14:30', '15:15', { locale: 'en' })).toBe('2:30 – 3:15 PM');
    expect(formatTimeRange('11:30', '12:15', { locale: 'en' })).toBe('11:30 AM – 12:15 PM');
  });

  it('takes instants too', () => {
    expect(
      formatTimeRange('2026-10-05T14:30:00+06:30', '2026-10-05T15:15:00+06:30', { locale: 'my' }),
    ).toBe('2:30 – 3:15 PM');
  });
});
