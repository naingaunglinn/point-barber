import { ReceiptCounterKind } from '../constants/status.js';

// The receipt number (D-PAY-06 · AD-FMT-06 · add-walkin-visit-checkout design D6):
// `<branch code>-<YYYY>-<MMM>-<seq>` and the refund series `<branch code>-RF-<YYYY>-<MMM>-<seq>`,
// the sequence padded to five digits. The month comes from this fixed array, never from a locale,
// so the number is the same in every language (never translated).
const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

export interface ReceiptNumberParts {
  readonly branchCode: string;
  readonly kind: ReceiptCounterKind;
  /** The year of the business date. */
  readonly year: number;
  /** The month of the business date, 1 – 12. */
  readonly month: number;
  /** `receipt_counters.last_seq` after the upsert, ≥ 1. */
  readonly seq: number;
}

/** `B3-2026-OCT-00125`; `B3-RF-2026-OCT-00001` for the refund series. */
export function formatReceiptNumber({
  branchCode,
  kind,
  year,
  month,
  seq,
}: ReceiptNumberParts): string {
  const monthName = MONTHS[month - 1];
  if (branchCode === '' || !Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError(`No receipt number for branch ${branchCode} and year ${year}`);
  }
  if (!Number.isInteger(month) || monthName === undefined) {
    throw new RangeError(`A receipt month is 1 – 12, got ${month}`);
  }
  if (!Number.isSafeInteger(seq) || seq < 1) {
    throw new RangeError(`A receipt sequence is a whole number ≥ 1, got ${seq}`);
  }
  const series = kind === ReceiptCounterKind.REFUND ? `${branchCode}-RF` : branchCode;
  return `${series}-${year}-${monthName}-${String(seq).padStart(5, '0')}`;
}
