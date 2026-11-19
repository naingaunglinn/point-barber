import { describe, expect, it } from 'vitest';

import { formatDuration, formatQty } from './quantity.js';

// ui-foundation · "Durations and quantities translate the unit, not the digits"
// (AD-FMT-05 · AD-FMT-08 · FE-FMT-01).
describe('formatDuration', () => {
  it.each([
    [30, '30 min'],
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [0, '0 min'],
    [125, '2 h 5 min'],
  ])('Scenario: Durations of the fixture services — %s in en → %s', (minutes, text) => {
    expect(formatDuration(minutes, { locale: 'en' })).toBe(text);
  });

  it.each([
    [45, '45 မိနစ်'],
    [90, '1 နာရီ 30 မိနစ်'],
    [120, '2 နာရီ'],
  ])('%s in my → %s', (minutes, text) => {
    expect(formatDuration(minutes, { locale: 'my' })).toBe(text);
  });

  it('refuses a duration that is not whole non-negative minutes', () => {
    expect(() => formatDuration(-5, { locale: 'en' })).toThrow(RangeError);
    expect(() => formatDuration(1.5, { locale: 'en' })).toThrow(RangeError);
  });
});

describe('formatQty', () => {
  it('Scenario: Quantity', () => {
    expect(formatQty(3, { locale: 'en' })).toBe('3 pcs');
    expect(formatQty(3, { locale: 'my' })).toBe('3 ခု');
  });

  it('groups large quantities with commas', () => {
    expect(formatQty(1250, { locale: 'en' })).toBe('1,250 pcs');
  });
});
