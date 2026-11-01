import { type Mmk, moneyFromWire, moneyToWire } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { type TotalsLine, type TotalsPayment, computeSaleTotals } from './sale-totals.js';

// add-walkin-visit-checkout task 6.1 — the SaleTotals.compute table of design D13 (D8 · P4-RULE-06 ·
// D-PLT-04 · CG-TEST-03): subtotal over lines without removed_at, no discount / service charge / tax
// in this change, paid over non-voided payments, remaining and change never negative, and FINISH
// allowed only when paid ≥ total and the excess is covered by non-cash payments (owner B5).
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

  it('an empty sale totals 0 and is finishable only by the visit rules, not here', () => {
    expect(wire([], [])).toMatchObject({ total: 0, remaining: 0, finish_allowed: true });
  });
});
