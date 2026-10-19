import {
  type PaymentDto,
  type PaymentMethodDto,
  PaymentMethodKind,
  type SaleDto,
} from '@point/shared';
import { describe, expect, it } from 'vitest';

import { checkoutMoney } from './checkout-money';

// add-walkin-visit-checkout task 12.6 — the two display rules of the checkout (AD-POS-08 · payments spec
// "A non-cash over-transfer is returned in cash", "Remaining to pay" · sales-checkout "Finish stays
// disabled …"): "Remaining to pay" while money is missing; "Change to return" only when FINISH would accept
// the excess — it is not larger than the non-voided non-cash payments. The amounts come from the server's
// Sale (API-DATA-02); the client only decides what to show.
const CASH_ID = '00000000-0000-4000-8000-0000000000c1';
const KBZ_ID = '00000000-0000-4000-8000-0000000000c2';

const method = (id: string, code: string, is_cash: boolean): PaymentMethodDto => ({
  id,
  code,
  name_mm: code,
  name_en: code,
  kind: is_cash ? PaymentMethodKind.CASH : PaymentMethodKind.MOBILE_WALLET,
  is_cash,
  requires_reference: !is_cash,
  requires_verification: false,
  reference_regex: null,
  is_system: true,
  sort_order: is_cash ? 1 : 2,
  status: 1,
  archived_at: null,
  updated_at: '2026-10-05T10:00:00+06:30',
});
const METHODS = [method(CASH_ID, 'CASH', true), method(KBZ_ID, 'KBZPAY', false)];

const payment = (methodId: string, amount: number, voided = false): PaymentDto =>
  ({
    id: `00000000-0000-4000-8000-${String(amount).padStart(12, '0')}`,
    payment_method: {
      id: methodId,
      code: methodId === CASH_ID ? 'CASH' : 'KBZPAY',
      name_mm: '',
      name_en: null,
      kind: methodId === CASH_ID ? PaymentMethodKind.CASH : PaymentMethodKind.MOBILE_WALLET,
    },
    amount,
    voided_at: voided ? '2026-10-05T10:45:00+06:30' : null,
  }) as unknown as PaymentDto;

/** The money members of a Sale as the server computes them. */
const sale = (
  total: number,
  payments: PaymentDto[],
): Pick<
  SaleDto,
  'total_amount' | 'paid_amount' | 'remaining_amount' | 'change_due_amount' | 'payments'
> => {
  const paid = payments.filter((p) => p.voided_at === null).reduce((sum, p) => sum + p.amount, 0);
  return {
    total_amount: total,
    paid_amount: paid,
    remaining_amount: Math.max(total - paid, 0),
    change_due_amount: Math.max(paid - total, 0),
    payments,
  };
};

describe('checkoutMoney (task 12.6)', () => {
  it('Scenario: Split Cash + KBZPay — "Remaining to pay: 6,000 Ks" after the first payment, Finish blocked', () => {
    expect(checkoutMoney(sale(11000, [payment(CASH_ID, 5000)]), METHODS)).toStrictEqual({
      remaining: 6000n,
      changeToReturn: null,
      finishBlocked: 'remaining',
    });
  });

  it('paid in full: no remaining line, no change line, Finish open', () => {
    expect(
      checkoutMoney(sale(11000, [payment(CASH_ID, 5000), payment(KBZ_ID, 6000)]), METHODS),
    ).toStrictEqual({ remaining: null, changeToReturn: null, finishBlocked: null });
  });

  it('Scenario: KBZPay 10,000 for a haircut of 8,000 — "Change to return: 2,000 Ks"', () => {
    expect(checkoutMoney(sale(8000, [payment(KBZ_ID, 10000)]), METHODS)).toStrictEqual({
      remaining: null,
      changeToReturn: 2000n,
      finishBlocked: null,
    });
  });

  it('Scenario: Over-transfer inside a split — excess 4,000 ≤ non-cash 10,000', () => {
    expect(
      checkoutMoney(sale(11000, [payment(CASH_ID, 5000), payment(KBZ_ID, 10000)]), METHODS)
        .changeToReturn,
    ).toBe(4000n);
  });

  it('Scenario: Excess exactly equal to the non-cash payments — shown, Finish open', () => {
    expect(
      checkoutMoney(sale(8000, [payment(CASH_ID, 8000), payment(KBZ_ID, 2000)]), METHODS),
    ).toStrictEqual({ remaining: null, changeToReturn: 2000n, finishBlocked: null });
  });

  it('Scenario: Finish stays disabled on a cash excess — no "Change to return" line', () => {
    expect(checkoutMoney(sale(8000, [payment(CASH_ID, 11000)]), METHODS)).toStrictEqual({
      remaining: null,
      changeToReturn: null,
      finishBlocked: 'cash_excess',
    });
  });

  it('Scenario: Finish stays disabled while money is missing — "Remaining to pay: 3,000 Ks"', () => {
    expect(checkoutMoney(sale(11000, [payment(CASH_ID, 8000)]), METHODS)).toStrictEqual({
      remaining: 3000n,
      changeToReturn: null,
      finishBlocked: 'remaining',
    });
  });

  it('a voided payment counts for nothing', () => {
    expect(
      checkoutMoney(sale(8000, [payment(KBZ_ID, 10000, true), payment(CASH_ID, 8000)]), METHODS),
    ).toStrictEqual({ remaining: null, changeToReturn: null, finishBlocked: null });
  });

  it('a method no longer in the active list is judged by its kind', () => {
    expect(checkoutMoney(sale(8000, [payment(KBZ_ID, 10000)]), []).changeToReturn).toBe(2000n);
    expect(checkoutMoney(sale(8000, [payment(CASH_ID, 10000)]), []).finishBlocked).toBe(
      'cash_excess',
    );
  });
});
