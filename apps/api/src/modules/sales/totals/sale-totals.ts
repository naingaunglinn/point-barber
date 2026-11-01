import {
  type Mmk,
  maxMoney,
  moneyFromWire,
  multiplyMoney,
  subtractMoney,
  sumMoney,
} from '@point/shared';

// SaleTotals.compute — one pure rule function (D-PLT-04 · API-DATA-02 · CG-MONEY-01 … 03 ·
// add-walkin-visit-checkout design D8): run under the sale row lock after every line or payment write
// and at FINISH step 11; the result is stored on `sales` and re-verified by `sales_amounts_chk`. The
// discount, service-charge and tax terms are 0 in this change; later changes fill them. No division and
// no rounding exist here.

export interface TotalsLine {
  readonly unit_price: Mmk;
  readonly quantity: number;
  /** A line with `removed_at` set counts for nothing (the row is kept — D-DAT-05). */
  readonly removed: boolean;
}

export interface TotalsPayment {
  readonly amount: Mmk;
  /** `payment_methods.is_cash` of the payment's effective method. */
  readonly is_cash: boolean;
  readonly voided: boolean;
}

export interface SaleTotals {
  readonly subtotal: Mmk;
  readonly discount: Mmk;
  readonly service_charge: Mmk;
  readonly tax: Mmk;
  readonly total: Mmk;
  readonly paid: Mmk;
  readonly remaining: Mmk;
  readonly change_due: Mmk;
  readonly non_cash_paid: Mmk;
  /** paid ≥ total and the excess is covered by non-cash payments (owner B5 — cash is never overpaid). */
  readonly finish_allowed: boolean;
}

const ZERO = moneyFromWire(0);

export function computeSaleTotals(
  lines: readonly TotalsLine[],
  payments: readonly TotalsPayment[],
): SaleTotals {
  const subtotal = sumMoney(
    lines
      .filter((line) => !line.removed)
      .map((line) => multiplyMoney(line.unit_price, line.quantity)),
  );
  const discount = ZERO;
  const serviceCharge = ZERO;
  const tax = ZERO;
  const total = sumMoney([subtractMoney(subtotal, discount), serviceCharge, tax]);
  const live = payments.filter((payment) => !payment.voided);
  const paid = sumMoney(live.map((payment) => payment.amount));
  const nonCashPaid = sumMoney(
    live.filter((payment) => !payment.is_cash).map((payment) => payment.amount),
  );
  const changeDue = maxMoney(subtractMoney(paid, total), ZERO);
  return {
    subtotal,
    discount,
    service_charge: serviceCharge,
    tax,
    total,
    paid,
    remaining: maxMoney(subtractMoney(total, paid), ZERO),
    change_due: changeDue,
    non_cash_paid: nonCashPaid,
    finish_allowed: paid >= total && changeDue <= nonCashPaid,
  };
}
