// Must fail three times (spec "Float money"): parseFloat, arithmetic on a money member, Number(amount).
declare const sale: { total_amount: bigint };
declare const amount: bigint;
export const a = parseFloat('7000');
export const b = sale.total_amount * 2n;
export const c = Number(amount);
