import { normalizeDigits } from '../text/digits.js';
import type { Mmk } from './mmk.js';

// The one money module (CG-MONEY-02 · add-shared-ui-components design D4): parsing what a person
// typed, the wire conversion of `_amount` fields (API-DATA-02) and sums. Money never passes
// through a float.

const MAX_WIRE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_WIRE = BigInt(Number.MIN_SAFE_INTEGER);

/** Digits with optional single comma or space separators: `7,000`, `7000`, `7 000`. */
const AMOUNT_TEXT = /^\d+(?:[, ]\d+)*$/;

/**
 * Whole kyats from typed or pasted text (AD-FORM-11): `7,000`, `7000`, `7 000` and `၇,၀၀၀` give
 * 7000; empty text gives null (not 0); a decimal point, a sign or a letter gives `amount_invalid`.
 */
export function parseMoneyInput(text: string): Mmk | null | 'amount_invalid' {
  const trimmed = normalizeDigits(text).trim();
  if (trimmed === '') return null;
  if (!AMOUNT_TEXT.test(trimmed)) return 'amount_invalid';
  return BigInt(trimmed.replace(/[, ]/g, '')) as Mmk;
}

/** The JSON integer of an `_amount` field → Mmk; throws unless it is a safe integer. */
export function moneyFromWire(amount: number): Mmk {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`An amount on the wire must be a safe integer, got ${amount}`);
  }
  return BigInt(amount) as Mmk;
}

/** Mmk → the JSON integer of an `_amount` field; throws outside the safe-integer range. */
export function moneyToWire(amount: Mmk): number {
  if (amount > MAX_WIRE || amount < MIN_WIRE) {
    throw new RangeError(`The amount ${amount} is outside the safe-integer range of the wire`);
  }
  return Number(amount);
}

/** The sum of whole-kyat amounts (5,000 + 6,000 = 11,000). */
export function sumMoney(amounts: readonly Mmk[]): Mmk {
  return amounts.reduce<bigint>((total, amount) => total + amount, 0n) as Mmk;
}

/** The difference of two amounts; negative when `b` is larger (8,000 − 10,000 = −2,000). */
export function subtractMoney(a: Mmk, b: Mmk): Mmk {
  return (a - b) as Mmk;
}

/**
 * A line total: the unit amount times a whole quantity (2,000 × 3 = 6,000). Throws unless the
 * quantity is a non-negative safe integer — a quantity is a count, never a fraction.
 */
export function multiplyMoney(amount: Mmk, quantity: number): Mmk {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError(`A quantity must be a whole number ≥ 0, got ${quantity}`);
  }
  return (amount * BigInt(quantity)) as Mmk;
}

/** The larger of two amounts — `maxMoney(total − paid, 0)` is the remaining amount. */
export function maxMoney(a: Mmk, b: Mmk): Mmk {
  return a >= b ? a : b;
}
