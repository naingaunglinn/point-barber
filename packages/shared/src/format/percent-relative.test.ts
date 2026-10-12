import { describe, expect, it } from 'vitest';

import { formatPercent, formatRelativeTime } from './percent-relative.js';

// ui-foundation · "Percentages show at most two decimals, rounded half up" (AD-FMT-07) and
// "Relative time is used up to 24 hours" (AD-FMT-09).
describe('formatPercent', () => {
  it.each([
    [0, '0%'],
    [15, '15%'],
    [12.5, '12.5%'],
    ['12.50', '12.5%'],
    ['2.5000', '2.5%'],
    [100, '100%'],
  ])('Scenario: Plain values — %j → %s', (value, text) => {
    expect(formatPercent(value)).toBe(text);
  });

  it.each([
    ['33.333', '33.33%'],
    ['12.345', '12.35%'],
    ['12.344', '12.34%'],
    ['99.995', '100%'],
    [12.345, '12.35%'],
    ['-2.345', '-2.35%'],
    ['0.004', '0%'],
  ])('Scenario: Rounding — %j → %s', (value, text) => {
    expect(formatPercent(value)).toBe(text);
  });

  it('refuses text that is not a decimal number', () => {
    expect(() => formatPercent('12,5')).toThrow(RangeError);
    expect(() => formatPercent(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatRelativeTime', () => {
  const now = '2026-10-05T10:42:00+06:30';
  const earlier = (seconds: number) => new Date(Date.parse(now) - seconds * 1000);

  it.each([
    [59, 'just now'],
    [60, '1 min ago'],
    [59 * 60, '59 min ago'],
    [60 * 60, '1 h ago'],
    [(23 * 60 + 59) * 60, '23 h ago'],
    [24 * 60 * 60, '04/Oct/2026'],
  ])('Scenario: Boundaries — %s s earlier → %s', (seconds, text) => {
    expect(formatRelativeTime(earlier(seconds), now, { locale: 'en' })).toBe(text);
  });

  it('writes the Myanmar words', () => {
    expect(formatRelativeTime(earlier(30), now, { locale: 'my' })).toBe('ယခုလေးတင်');
    expect(formatRelativeTime(earlier(5 * 60), now, { locale: 'my' })).toBe('လွန်ခဲ့သော 5 မိနစ်');
    expect(formatRelativeTime(earlier(3 * 3600), now, { locale: 'my' })).toBe('လွန်ခဲ့သော 3 နာရီ');
  });

  it('a moment later than now (a clock a little ahead) is just now', () => {
    expect(formatRelativeTime('2026-10-05T10:42:30+06:30', now, { locale: 'en' })).toBe('just now');
  });
});
