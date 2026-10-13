import { describe, expect, it } from 'vitest';

import { normalizeDigits } from './digits.js';

// ui-foundation · "Data values use the digits 0–9 and typed Myanmar digits are normalised"
// (D-PLT-05 · AD-FMT-10).
describe('normalizeDigits', () => {
  it('Scenario: Myanmar digits are converted', () => {
    expect(normalizeDigits('၀၁၂၃၄၅၆၇၈၉')).toBe('0123456789');
  });

  it('keeps every other character, Myanmar letters included', () => {
    expect(normalizeDigits('၀၉ ၇၇၁၂-၃၄၅၆')).toBe('09 7712-3456');
    expect(normalizeDigits('ဆံပင်ညှပ် ၂ ခု')).toBe('ဆံပင်ညှပ် 2 ခု');
    expect(normalizeDigits('7,000 Ks')).toBe('7,000 Ks');
  });
});
