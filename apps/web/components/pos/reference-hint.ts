// The helper text of a reference field, generated from the method's `reference_regex` (AD-FORM-12 ·
// payments spec "The KBZPay sheet … shows the expected format as helper text generated from the method's
// format"): a fixed prefix and a digit count (`^KBZ[0-9]{10}$` → prefix KBZ, 10 digits) or a digit count
// alone. Any other pattern gives no helper — the server still checks it (422 `reference_format`).

export type ReferenceHint =
  | { readonly kind: 'prefixDigits'; readonly prefix: string; readonly count: number }
  | { readonly kind: 'digits'; readonly count: number };

const SHAPE = /^\^?([A-Za-z0-9]*)(?:\[0-9\]|\\d)\{(\d+)\}\$?$/;

export function referenceHint(regex: string | null): ReferenceHint | null {
  if (regex === null) return null;
  const match = SHAPE.exec(regex);
  if (match === null) return null;
  const prefix = match[1] ?? '';
  const count = Number(match[2]);
  return prefix === '' ? { kind: 'digits', count } : { kind: 'prefixDigits', prefix, count };
}
