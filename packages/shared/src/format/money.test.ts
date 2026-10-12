import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Mmk } from '../money/mmk.js';
import { formatMoney } from './money.js';

const ks = (amount: bigint) => amount as Mmk; // test values; production code builds Mmk through the parser and wire helpers

// ui-foundation · "Money is displayed through one formatter with the `app` and `site` profiles"
// (D-PLT-04 · AD-FMT-01 · FE-FMT-01).
describe('formatMoney', () => {
  it.each([
    [0n, '0 Ks'],
    [999n, '999 Ks'],
    [1000n, '1,000 Ks'],
    [7000n, '7,000 Ks'],
    [1250000n, '1,250,000 Ks'],
  ])('Scenario: Staff app, English — %s → %s', (amount, text) => {
    expect(formatMoney(ks(amount), { locale: 'en', profile: 'app' })).toBe(text);
  });

  it.each([
    [7000n, '7,000 ကျပ်'],
    [1250000n, '1,250,000 ကျပ်'],
  ])('Scenario: Staff app, Myanmar — %s → %s', (amount, text) => {
    expect(formatMoney(ks(amount), { locale: 'my', profile: 'app' })).toBe(text);
  });

  it.each(['my', 'en'] as const)('Scenario: Website profile shows Ks in %s', (locale) => {
    expect(formatMoney(ks(7000n), { locale, profile: 'site' })).toBe('7,000 Ks');
  });

  it('Scenario: Refund amount — a negative amount starts with -', () => {
    expect(formatMoney(ks(-6000n), { locale: 'en', profile: 'app' })).toBe('-6,000 Ks');
  });

  it('Scenario: Table cell without the unit', () => {
    expect(formatMoney(ks(8000n), { locale: 'en', profile: 'app', unit: false })).toBe('8,000');
    expect(formatMoney(ks(-6000n), { locale: 'my', profile: 'app', unit: false })).toBe('-6,000');
  });

  it('keeps every digit above the float limit', () => {
    expect(formatMoney(ks(9007199254740993n), { locale: 'en', profile: 'app' })).toBe(
      '9,007,199,254,740,993 Ks',
    );
  });

  it('Scenario: A plain number is not money (type test)', () => {
    expectTypeOf(formatMoney).parameter(0).toEqualTypeOf<Mmk>();
    // @ts-expect-error — a JavaScript number is not money (CG-MONEY-02).
    formatMoney(7000, { locale: 'en', profile: 'app' });
    // @ts-expect-error — neither is a bare bigint: only Mmk is.
    formatMoney(7000n, { locale: 'en', profile: 'app' });
  });
});
