import { describe, expect, it } from 'vitest';

import { businessDateOf, todayMmt } from './business-date.js';

// ui-foundation · "Dates and times are formatted in Myanmar Time whatever the device time zone is"
// and "Today and now come from the supplied clock" (D-PLT-15 · AD-FMT-11 · CG-TIME-04 · CG-TIME-05).
// The same expected values pass under TZ=UTC, TZ=Asia/Yangon and TZ=America/Los_Angeles
// (`pnpm --filter @point/shared test:zones`).
describe('businessDateOf', () => {
  it.each([
    ['2026-10-04T23:59:59+06:30', '2026-10-04'],
    ['2026-10-05T00:00:00+06:30', '2026-10-05'],
    ['2026-10-31T23:59:00+06:30', '2026-10-31'],
    ['2026-11-01T00:00:00+06:30', '2026-11-01'],
    // Technical case: one second before UTC midnight = 06:29:59 MMT of the next day.
    ['2026-10-04T23:59:59Z', '2026-10-05'],
    // UTC midnight itself = 06:30 MMT.
    ['2026-10-05T00:00:00Z', '2026-10-05'],
  ])('%s → %s', (instant, date) => {
    expect(businessDateOf(instant)).toBe(date);
    expect(businessDateOf(new Date(instant))).toBe(date);
  });

  it('Scenario: Business date of an instant — 17:29 UTC and 17:30 UTC', () => {
    expect(businessDateOf('2026-10-04T17:29:00Z')).toBe('2026-10-04');
    expect(businessDateOf('2026-10-04T17:30:00Z')).toBe('2026-10-05');
  });

  it('refuses a value that is not an instant', () => {
    expect(() => businessDateOf('05/Oct/2026')).toThrow(RangeError);
  });
});

describe('todayMmt', () => {
  it('is the Myanmar date of the supplied instant, never the device date', () => {
    expect(todayMmt('2026-10-05T10:42:00+06:30')).toBe('2026-10-05');
    expect(todayMmt('2026-10-05T17:29:30Z')).toBe('2026-10-05');
    expect(todayMmt('2026-10-05T17:30:30Z')).toBe('2026-10-06');
  });
});
