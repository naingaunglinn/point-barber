// Must pass inside packages/shared/src/money (spec "The money module is allowed").
type Mmk = bigint & { readonly __mmk: true };
export function add(amount: Mmk, other_amount: Mmk): Mmk {
  return (amount + other_amount) as Mmk;
}
