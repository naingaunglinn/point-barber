import { describe, expect, it } from 'vitest';

import { utcDateOf } from './utc-date.js';

// The helper reads a date that was built at UTC midnight (`new Date('2026-10-05T00:00:00Z')`); the
// e2e workspace cannot import `businessDateOf` from @point/shared (CG-TIME-02).
describe('utcDateOf', () => {
  it.each([
    ['2026-10-05T00:00:00Z', '2026-10-05'],
    ['2026-01-09T00:00:00Z', '2026-01-09'],
    ['2026-12-31T00:00:00Z', '2026-12-31'],
    ['2026-03-01T00:00:00Z', '2026-03-01'],
  ])('%s → %s', (instant, date) => {
    expect(utcDateOf(new Date(instant))).toBe(date);
  });

  it('gives the same date for the day before a UTC-midnight day, built by subtracting 24 hours', () => {
    const today = new Date('2026-10-05T00:00:00Z');
    expect(utcDateOf(new Date(today.getTime() - 24 * 60 * 60 * 1000))).toBe('2026-10-04');
  });
});
