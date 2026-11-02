import { type Mmk, moneyFromWire, moneyToWire } from '@point/shared';
import { describe, expect, it } from 'vitest';

import {
  type FinishRefusal,
  type TotalsLine,
  type TotalsPayment,
  computeSaleTotals,
  finishRefusal,
} from './sale-totals.js';

// add-walkin-visit-checkout task 6.1 — the SaleTotals.compute table of design D13 (D8 · P4-RULE-06 ·
// D-PLT-04 · CG-TEST-03): subtotal over lines without removed_at, no discount / service charge / tax
// in this change, paid over non-voided payments, remaining and change never negative, and FINISH
// allowed only when paid ≥ total, the excess is covered by non-cash payments (owner B5) and the change
// is at most MAX_OVER_TRANSFER_CHANGE_AMOUNT (owner WR1 — task 15.3).
const ks = (amount: number): Mmk => moneyFromWire(amount);
const line = (unit: number, over: Partial<TotalsLine> = {}): TotalsLine => ({
  unit_price: ks(unit),
  quantity: 1,
  removed: false,
  ...over,
});
const cash = (amount: number, voided = false): TotalsPayment => ({
  amount: ks(amount),
  is_cash: true,
  voided,
});
const kbzpay = (amount: number, voided = false): TotalsPayment => ({
  amount: ks(amount),
  is_cash: false,
  voided,
});

const wire = (lines: TotalsLine[], payments: TotalsPayment[]) => {
  const totals = computeSaleTotals(lines, payments);
  return {
    subtotal: moneyToWire(totals.subtotal),
    total: moneyToWire(totals.total),
    paid: moneyToWire(totals.paid),
    remaining: moneyToWire(totals.remaining),
    change_due: moneyToWire(totals.change_due),
    non_cash_paid: moneyToWire(totals.non_cash_paid),
    finish_allowed: totals.finish_allowed,
  };
};

describe('computeSaleTotals (design D8 / D13)', () => {
  it('8,000 — one Haircut, nothing paid', () => {
    expect(wire([line(8000)], [])).toStrictEqual({
      subtotal: 8000,
      total: 8000,
      paid: 0,
      remaining: 8000,
      change_due: 0,
      non_cash_paid: 0,
      finish_allowed: false,
    });
  });

  it('8,000 + 3,000 = 11,000', () => {
    expect(wire([line(8000), line(3000)], []).total).toBe(11000);
  });

  it('10,000 + 3,000 + 2,000 with Hair wash removed = 13,000', () => {
    expect(wire([line(10000), line(3000), line(2000, { removed: true })], []).total).toBe(13000);
  });

  it('a quantity multiplies the unit price: 2,000 × 3 = 6,000', () => {
    expect(wire([line(2000, { quantity: 3 })], []).subtotal).toBe(6000);
  });

  it('Cash 5,000 on 11,000 → remaining 6,000, not finishable', () => {
    expect(wire([line(8000), line(3000)], [cash(5000)])).toMatchObject({
      paid: 5000,
      remaining: 6000,
      change_due: 0,
      finish_allowed: false,
    });
  });

  it('a voided payment counts for nothing', () => {
    expect(wire([line(8000)], [cash(8000, true), kbzpay(2000, true)])).toMatchObject({
      paid: 0,
      remaining: 8000,
      non_cash_paid: 0,
    });
  });

  it('Cash 8,000 on 8,000 → finishable, no change', () => {
    expect(wire([line(8000)], [cash(8000)])).toMatchObject({
      remaining: 0,
      change_due: 0,
      finish_allowed: true,
    });
  });

  it('KBZPay 10,000 on 8,000 → change 2,000, allowed', () => {
    expect(wire([line(8000)], [kbzpay(10000)])).toMatchObject({
      remaining: 0,
      change_due: 2000,
      non_cash_paid: 10000,
      finish_allowed: true,
    });
  });

  it('Cash 5,000 + KBZPay 10,000 on 11,000 → change 4,000, allowed (4,000 ≤ 10,000)', () => {
    expect(wire([line(8000), line(3000)], [cash(5000), kbzpay(10000)])).toMatchObject({
      paid: 15000,
      change_due: 4000,
      finish_allowed: true,
    });
  });

  it('Cash 8,000 + KBZPay 2,000 on 8,000 → change 2,000, allowed (2,000 ≤ 2,000)', () => {
    expect(wire([line(8000)], [cash(8000), kbzpay(2000)])).toMatchObject({
      change_due: 2000,
      finish_allowed: true,
    });
  });

  it('Cash 11,000 on 8,000 → excess 3,000 > 0 non-cash → not allowed', () => {
    expect(wire([line(8000)], [cash(11000)])).toMatchObject({
      change_due: 3000,
      non_cash_paid: 0,
      finish_allowed: false,
    });
  });

  // Task 15.3 — owner sheet WR1 (API Part 4 v1.4 P4-RULE-10 #12): the change is at most 10,000 Ks.
  it('KBZPay 18,000 on 8,000 → change 10,000, allowed (10,000 ≤ 10,000)', () => {
    expect(wire([line(8000)], [kbzpay(18000)])).toMatchObject({
      remaining: 0,
      change_due: 10000,
      non_cash_paid: 18000,
      finish_allowed: true,
    });
  });

  it('KBZPay 18,001 on 8,000 → change 10,001 > 10,000, not allowed', () => {
    expect(wire([line(8000)], [kbzpay(18001)])).toMatchObject({
      change_due: 10001,
      non_cash_paid: 18001,
      finish_allowed: false,
    });
  });

  it('KBZPay 20,000 on 8,000 → change 12,000, not allowed', () => {
    expect(wire([line(8000)], [kbzpay(20000)])).toMatchObject({
      remaining: 0,
      change_due: 12000,
      non_cash_paid: 20000,
      finish_allowed: false,
    });
  });

  it('an empty sale totals 0 and is finishable only by the visit rules, not here', () => {
    expect(wire([], [])).toMatchObject({ total: 0, remaining: 0, finish_allowed: true });
  });
});

// The money checks of FINISH step 12 in their order (P4-RULE-10 #12 · owner B5 / WR1): FINISH answers
// with this code, and `finish_allowed` is "no refusal" — one rule for both.
describe('finishRefusal (FINISH step 12)', () => {
  it.each<[string, TotalsLine[], TotalsPayment[], FinishRefusal | null]>([
    [
      'Cash 5,000 on 11,000 → money missing',
      [line(8000), line(3000)],
      [cash(5000)],
      'amount_mismatch',
    ],
    ['Cash 11,000 on 8,000 → a cash excess', [line(8000)], [cash(11000)], 'amount_mismatch'],
    // payments spec "A cash excess above the limit still answers amount_mismatch".
    [
      'Cash 15,000 + KBZPay 1,000 on 5,000 → excess 11,000 > 1,000 non-cash, before the change limit',
      [line(10000, { removed: true }), line(3000), line(2000)],
      [cash(15000), kbzpay(1000)],
      'amount_mismatch',
    ],
    ['Cash 8,000 on 8,000', [line(8000)], [cash(8000)], null],
    ['KBZPay 18,000 on 8,000 → change 10,000', [line(8000)], [kbzpay(18000)], null],
    ['KBZPay 18,001 on 8,000 → change 10,001', [line(8000)], [kbzpay(18001)], 'change_too_large'],
    ['KBZPay 25,000 on 10,000 → change 15,000', [line(10000)], [kbzpay(25000)], 'change_too_large'],
  ])('%s', (_name, lines, payments, refusal) => {
    const totals = computeSaleTotals(lines, payments);
    expect(finishRefusal(totals)).toBe(refusal);
    expect(totals.finish_allowed).toBe(refusal === null);
  });
});
