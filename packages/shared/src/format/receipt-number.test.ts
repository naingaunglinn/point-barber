import { describe, expect, it } from 'vitest';

import { ReceiptCounterKind } from '../constants/status.js';
import { formatReceiptNumber, type ReceiptNumberParts } from './receipt-number.js';

// add-walkin-visit-checkout task 2.10 — `<branch code>-<YYYY>-<MMM>-<seq>`, the refund series with
// `-RF-`, the sequence padded to five digits; never translated (D-PAY-06 · AD-FMT-06 · design D6).
const sale = { branchCode: 'B3', kind: ReceiptCounterKind.SALE, year: 2026, month: 10 } as const;

describe('formatReceiptNumber', () => {
  it.each([
    [1, 'B3-2026-OCT-00001'],
    [125, 'B3-2026-OCT-00125'],
    [99_999, 'B3-2026-OCT-99999'],
    // A sixth digit is kept, never cut.
    [123_456, 'B3-2026-OCT-123456'],
  ])('sale sequence %d → %s', (seq, number) => {
    expect(formatReceiptNumber({ ...sale, seq })).toBe(number);
  });

  it('the month is the fixed English abbreviation: 11 → NOV, 1 → JAN, 12 → DEC', () => {
    expect(formatReceiptNumber({ ...sale, month: 11, seq: 1 })).toBe('B3-2026-NOV-00001');
    expect(formatReceiptNumber({ ...sale, year: 2027, month: 1, seq: 1 })).toBe(
      'B3-2027-JAN-00001',
    );
    expect(formatReceiptNumber({ ...sale, month: 12, seq: 7 })).toBe('B3-2026-DEC-00007');
  });

  it('the refund series: B3-RF-2026-OCT-00001', () => {
    expect(formatReceiptNumber({ ...sale, kind: ReceiptCounterKind.REFUND, seq: 1 })).toBe(
      'B3-RF-2026-OCT-00001',
    );
  });

  it.each([
    ['month 0', { month: 0 }],
    ['month 13', { month: 13 }],
    ['sequence 0', { seq: 0 }],
    ['a fractional sequence', { seq: 1.5 }],
    ['a three-digit year', { year: 999 }],
    ['an empty branch code', { branchCode: '' }],
  ])('refuses %s', (_, change: Partial<ReceiptNumberParts>) => {
    expect(() => formatReceiptNumber({ ...sale, seq: 1, ...change })).toThrow(RangeError);
  });
});
