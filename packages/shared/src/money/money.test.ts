import { describe, expect, expectTypeOf, it } from 'vitest';

import { formatMoney } from '../format/money.js';
import type { Mmk } from './mmk.js';
import {
  maxMoney,
  moneyFromWire,
  moneyToWire,
  multiplyMoney,
  parseMoneyInput,
  subtractMoney,
  sumMoney,
} from './money.js';

// ui-foundation · "Money is an integer end to end in front-end code"
// (D-PLT-04 · API-DATA-02 · AD-IMPL-05 · AD-FORM-11 · CG-MONEY-02).
describe('parseMoneyInput', () => {
  it.each(['7,000', '7000', '7 000', '၇,၀၀၀', ' 7,000 '])(
    'Scenario: Accepted forms of 7,000 — %j',
    (text) => {
      expect(parseMoneyInput(text)).toBe(7000n);
    },
  );

  it.each(['7000.50', '-500', '7k', '7,,000', ',7000', '7000,', '7.000', '+500', '٧٠٠٠'])(
    'Scenario: Rejected forms — %j',
    (text) => {
      expect(parseMoneyInput(text)).toBe('amount_invalid');
    },
  );

  it('Scenario: Empty is not zero', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('   ')).toBeNull();
    expect(parseMoneyInput('0')).toBe(0n);
  });

  it('Scenario: No precision loss above the float limit', () => {
    const amount = parseMoneyInput('9007199254740993');
    expect(amount).toBe(9007199254740993n);
    expect(formatMoney(amount as Mmk, { locale: 'en', profile: 'app' })).toBe(
      '9,007,199,254,740,993 Ks',
    );
  });

  it('returns Mmk, null or the error code', () => {
    expectTypeOf(parseMoneyInput).returns.toEqualTypeOf<Mmk | null | 'amount_invalid'>();
  });
});

describe('moneyFromWire / moneyToWire', () => {
  it('converts the JSON integer of an _amount field both ways', () => {
    expect(moneyFromWire(7000)).toBe(7000n);
    expect(moneyFromWire(-6000)).toBe(-6000n);
    expect(moneyToWire(moneyFromWire(8000))).toBe(8000);
    expect(moneyFromWire(Number.MAX_SAFE_INTEGER)).toBe(9007199254740991n);
  });

  it('Scenario: Wire boundaries — moneyFromWire(7000.5) throws', () => {
    expect(() => moneyFromWire(7000.5)).toThrow(RangeError);
    expect(() => moneyFromWire(Number.NaN)).toThrow(RangeError);
    expect(() => moneyFromWire(9007199254740992)).toThrow(RangeError);
  });

  it('Scenario: Wire boundaries — moneyToWire(9007199254740993) throws', () => {
    expect(() => moneyToWire(9007199254740993n as Mmk)).toThrow(RangeError);
    expect(() => moneyToWire(-9007199254740992n as Mmk)).toThrow(RangeError);
    expect(moneyToWire(-9007199254740991n as Mmk)).toBe(-9007199254740991);
  });
});

describe('sumMoney', () => {
  it('Scenario: Sum of a split payment — Cash 5,000 + KBZPay 6,000 = 11,000', () => {
    const total = sumMoney([moneyFromWire(5000), moneyFromWire(6000)]);
    expect(total).toBe(11000n);
    expect(formatMoney(total, { locale: 'en', profile: 'app' })).toBe('11,000 Ks');
  });

  it('the sum of nothing is 0, and the result is Mmk', () => {
    expect(sumMoney([])).toBe(0n);
    expectTypeOf(sumMoney).returns.toEqualTypeOf<Mmk>();
  });
});

// add-walkin-visit-checkout task 2.8 — the arithmetic of the sale totals (design D8 · CG-MONEY-03).
describe('subtractMoney, multiplyMoney, maxMoney', () => {
  const ks = (amount: number) => moneyFromWire(amount);

  it('remaining = total − paid: 11,000 − 5,000 = 6,000', () => {
    expect(subtractMoney(ks(11_000), ks(5_000))).toBe(6000n);
  });

  it('an over-payment gives a negative difference: 8,000 − 10,000 = −2,000', () => {
    expect(subtractMoney(ks(8_000), ks(10_000))).toBe(-2000n);
  });

  it('a line total = unit × quantity: 2,000 × 3 = 6,000; × 1 is the unit; × 0 is 0', () => {
    expect(multiplyMoney(ks(2_000), 3)).toBe(6000n);
    expect(multiplyMoney(ks(8_000), 1)).toBe(8000n);
    expect(multiplyMoney(ks(8_000), 0)).toBe(0n);
  });

  it('stays exact above the float limit', () => {
    expect(multiplyMoney(ks(Number.MAX_SAFE_INTEGER), 3)).toBe(27021597764222973n);
  });

  it.each([1.5, -1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'refuses the quantity %s',
    (quantity) => {
      expect(() => multiplyMoney(ks(2_000), quantity)).toThrow(RangeError);
    },
  );

  it('max(total − paid, 0): remaining is never negative, change is never negative', () => {
    const zero = ks(0);
    expect(maxMoney(subtractMoney(ks(8_000), ks(10_000)), zero)).toBe(0n);
    expect(maxMoney(subtractMoney(ks(10_000), ks(8_000)), zero)).toBe(2000n);
    expect(maxMoney(ks(5_000), ks(5_000))).toBe(5000n);
  });

  it('every result is Mmk', () => {
    expectTypeOf(subtractMoney(ks(2), ks(1))).toEqualTypeOf<Mmk>();
    expectTypeOf(multiplyMoney(ks(2), 2)).toEqualTypeOf<Mmk>();
    expectTypeOf(maxMoney(ks(2), ks(1))).toEqualTypeOf<Mmk>();
  });
});
