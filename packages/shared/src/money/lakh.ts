import type { Mmk } from './mmk.js';

const LAKH = 100_000n;

/**
 * The amount in lakhs (သိန်း — AD-FORM-11 · design D4): the integer part is amount ÷ 100,000, the
 * remainder is written as up to five decimals with trailing zeros removed — exact, never rounded
 * (`123,456` → `1.23456`). Null below one lakh.
 */
export function formatLakh(amount: Mmk): string | null {
  if (amount < LAKH) return null;
  const whole = amount / LAKH;
  const rest = (amount % LAKH).toString().padStart(5, '0').replace(/0+$/, '');
  return rest === '' ? whole.toString() : `${whole}.${rest}`;
}
