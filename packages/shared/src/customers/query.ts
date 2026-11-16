import { normalizeDigits } from '../text/digits.js';

// The customer search reader (P3.CUS.01 · D-CUS-06 · AD-FORM-10 · owner CM1 ★ · design D3 / R5) —
// used by the customer list and, later, by the customers group of global search (add-global-search).
// The text is trimmed and its Myanmar digits read as 0–9. Only digits, spaces, dashes and one leading
// `+` with at least 6 digits is a phone search: the digits, a leading 0 read as 95, matched anywhere in
// `phone_normalized`. Anything else is a name search: `name ILIKE '%' || pattern || '%'`, with the
// LIKE signs of the text escaped.

export type CustomerQuery =
  | { readonly kind: 'phone'; readonly digits: string }
  | { readonly kind: 'name'; readonly pattern: string };

const PHONE_TEXT = /^\+?[0-9 -]+$/;
const PHONE_MIN_DIGITS = 6;

/** `%`, `_` and `\` written as literals of a LIKE pattern (PostgreSQL's default escape `\`). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (sign) => `\\${sign}`);
}

/** The search `q` reads; null when it is empty or blank (no filter). */
export function parseCustomerQuery(q: string | undefined): CustomerQuery | null {
  const text = normalizeDigits(q ?? '').trim();
  if (text === '') return null;
  if (PHONE_TEXT.test(text)) {
    const digits = text.replace(/[^0-9]/g, '');
    if (digits.length >= PHONE_MIN_DIGITS) {
      return { kind: 'phone', digits: digits.startsWith('0') ? `95${digits.slice(1)}` : digits };
    }
  }
  return { kind: 'name', pattern: escapeLike(text) };
}
