import { describe, expect, it } from 'vitest';

import { formatLakh } from './lakh.js';
import { moneyFromWire } from './money.js';

// The သိန်း helper of AD-FORM-11 (design D4): exact, never rounded; nothing below one lakh.
describe('formatLakh', () => {
  it.each([
    [99_999, null],
    [100_000, '1'],
    [2_250_000, '22.5'],
    [123_456, '1.23456'],
    [1_000_000, '10'],
    [100_001, '1.00001'],
    [0, null],
    [-500_000, null],
  ])('%s → %j', (amount, lakh) => {
    expect(formatLakh(moneyFromWire(amount))).toBe(lakh);
  });
});
