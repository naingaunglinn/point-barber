import { formatPhone, normalizePhone } from '@point/shared';

// How the customer screens write a stored phone (AD-FMT-04 · proposal reading 8): `formatPhone` of the
// E.164 the API sends as `phone_normalized` (`+95977123456` → `09 7712 3456`); a number outside the Myanmar
// grouping stays as stored.
export function phoneText(phoneNormalized: string): string {
  const e164 = normalizePhone(phoneNormalized);
  return e164 === 'phone_invalid' ? phoneNormalized : formatPhone(e164);
}
