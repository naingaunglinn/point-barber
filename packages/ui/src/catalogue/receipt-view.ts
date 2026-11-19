import { sumMoney, type ReceiptView } from '@point/shared';

import { BRANCHES, DATES, PEOPLE, RECEIPT, SERVICES } from './fixtures';

// The catalogue receipt (design D12 · spec-fixtures §8 "Receipt"): B3-2026-OCT-00003 at Point 3.0,
// finished 05/Oct/2026 10:42 AM by Ko Min for Ma Su — Haircut 8,000 + Shave 3,000 = 11,000, paid
// Cash 5,000 + KBZPay 6,000. The payment method names are those of the seeded CASH and KBZPAY methods
// (spec-fixtures §4); lines carry both descriptions (API Part 4 v1.2).

const B3 = BRANCHES.find((branch) => branch.code === 'B3');
const METHOD_NAMES = { CASH: 'Cash', KBZPAY: 'KBZPay' } as const;

const LINES = [SERVICES.haircut, SERVICES.shave].map((service) => {
  const price = service.prices.B3;
  return {
    description_en: service.name_en,
    description_mm: service.name_mm,
    option: null,
    performer: PEOPLE.min.name_en,
    quantity: 1,
    unit_price_amount: price,
    amount: price,
  };
});
const TOTAL = sumMoney(LINES.map((line) => line.amount));

export const RECEIPT_VIEW: ReceiptView = {
  kind: 'sale',
  number: RECEIPT.receiptNo,
  original_number: null,
  issued_at: DATES.finish,
  branch: { name: B3?.name_en ?? '', address: null, phone: null, logo_url: null },
  barbers: [PEOPLE.min.name_en ?? ''],
  customer_name: RECEIPT.customer.name,
  customer_phone_masked: RECEIPT.maskedPhone,
  lines: LINES,
  subtotal_amount: TOTAL,
  discount_label: null,
  discount_amount: sumMoney([]),
  service_charge_amount: null,
  tax_amount: null,
  total_amount: TOTAL,
  payments: RECEIPT.payments.map((payment) => ({
    method: METHOD_NAMES[payment.method],
    amount: payment.amount,
    reference: payment.reference,
  })),
  change_returned: null,
};
