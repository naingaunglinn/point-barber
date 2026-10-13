import { normalizeDigits } from '../text/digits.js';

// A phone number is stored and compared in E.164 (D-CUS-02 · API-DATA-06 · P3-RULE-01) and shown in
// local grouping (AD-FMT-04). The API and the web app use this one function (FE-IMPL-03).
export type E164 = `+${string}`;

const E164_PATTERN = /^\+[1-9][0-9]{6,14}$/;

function isE164(text: string): text is E164 {
  return E164_PATTERN.test(text);
}

/**
 * `09 7712 3456`, `09-7712-3456`, `+95977123456`, `95977123456`, `၀၉ ၇၇၁၂ ၃၄၅၆` → `+95977123456`;
 * anything that is not E.164 after the rules gives `phone_invalid`.
 */
export function normalizePhone(text: string): E164 | 'phone_invalid' {
  const compact = normalizeDigits(text).replace(/[\s-]/g, '');
  let candidate: string;
  if (compact.startsWith('+')) candidate = compact;
  else if (compact.startsWith('959')) candidate = `+${compact}`;
  else if (compact.startsWith('0')) candidate = `+95${compact.slice(1)}`;
  else return 'phone_invalid';
  return isE164(candidate) ? candidate : 'phone_invalid';
}

/** `+95977123456` → `09 7712 3456`; 9 digits after `09` → 3-3-3, 8 → 4-4, 7 → 3-4; else unchanged. */
export function formatPhone(e164: E164): string {
  const match = /^\+959(\d+)$/.exec(e164);
  const local = match?.[1];
  if (local === undefined) return e164;
  if (local.length === 9) return `09 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  if (local.length === 8) return `09 ${local.slice(0, 4)} ${local.slice(4)}`;
  if (local.length === 7) return `09 ${local.slice(0, 3)} ${local.slice(3)}`;
  return e164;
}
