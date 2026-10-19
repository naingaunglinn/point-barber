import {
  type Mmk,
  type PaymentMethodDto,
  PaymentMethodKind,
  type SaleDto,
  moneyFromWire,
  sumMoney,
} from '@point/shared';

// What the checkout shows about money (AD-POS-08 · add-walkin-visit-checkout task 12.6). The amounts are the
// server's (API-DATA-02 — totals are computed by the server, CG-MONEY-01); the client decides only which
// lines appear and why Finish is disabled:
// - "Remaining to pay" while `remaining_amount` is above 0 (payments spec — visible until it reaches 0);
// - "Change to return" only when FINISH would accept the excess: `change_due_amount` is not larger than the
//   non-voided non-cash payments (payments spec "A non-cash over-transfer is returned in cash");
// - Finish disabled while money is missing, or on a cash excess (void the cash payment and take it again).
// A payment's method is cash when the active methods (`GET /v1/payment-methods`) say `is_cash`; a method no
// longer in that list is judged by its kind.

export type FinishBlock = 'remaining' | 'cash_excess';

export interface CheckoutMoney {
  readonly remaining: Mmk | null;
  readonly changeToReturn: Mmk | null;
  readonly finishBlocked: FinishBlock | null;
}

type SaleMoney = Pick<SaleDto, 'remaining_amount' | 'change_due_amount' | 'payments'>;
type MethodCash = Pick<PaymentMethodDto, 'id' | 'is_cash'>;

/** Cash by the active methods' `is_cash`; a method no longer in that list by its kind. */
export function isCashPayment(
  payment: SaleDto['payments'][number],
  methods: readonly MethodCash[],
): boolean {
  const method = methods.find((item) => item.id === payment.payment_method.id);
  return method !== undefined
    ? method.is_cash
    : payment.payment_method.kind === PaymentMethodKind.CASH;
}

export function checkoutMoney(sale: SaleMoney, methods: readonly MethodCash[]): CheckoutMoney {
  const nonCash = sumMoney(
    sale.payments
      .filter((payment) => payment.voided_at === null && !isCashPayment(payment, methods))
      .map((payment) => moneyFromWire(payment.amount)),
  );
  const remaining = moneyFromWire(sale.remaining_amount);
  const change = moneyFromWire(sale.change_due_amount);
  const accepted = change <= nonCash;
  return {
    remaining: remaining > 0n ? remaining : null,
    changeToReturn: change > 0n && accepted ? change : null,
    finishBlocked: remaining > 0n ? 'remaining' : accepted ? null : 'cash_excess',
  };
}
