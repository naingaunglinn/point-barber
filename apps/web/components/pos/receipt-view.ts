import { type ReceiptView, type ReceiptViewDto, moneyFromWire } from '@point/shared';

// `GET …/receipt?format=json` (P4.RCP.01) as the on-screen receipt takes it: the wire integers as Mmk
// (API-DATA-02 · CG-MONEY-02), nothing else changed.
export function toReceiptView(dto: ReceiptViewDto): ReceiptView {
  return {
    ...dto,
    lines: dto.lines.map((line) => ({
      ...line,
      unit_price_amount: moneyFromWire(line.unit_price_amount),
      amount: moneyFromWire(line.amount),
    })),
    subtotal_amount: moneyFromWire(dto.subtotal_amount),
    discount_amount: moneyFromWire(dto.discount_amount),
    service_charge_amount:
      dto.service_charge_amount === null ? null : moneyFromWire(dto.service_charge_amount),
    tax_amount: dto.tax_amount === null ? null : moneyFromWire(dto.tax_amount),
    total_amount: moneyFromWire(dto.total_amount),
    payments: dto.payments.map((payment) => ({
      ...payment,
      amount: moneyFromWire(payment.amount),
    })),
    change_returned:
      dto.change_returned === null
        ? null
        : { ...dto.change_returned, amount: moneyFromWire(dto.change_returned.amount) },
  };
}
