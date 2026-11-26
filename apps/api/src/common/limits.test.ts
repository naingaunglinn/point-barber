import { PAYMENT_METHOD_ORDER_MAX } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { READ_ROW_CEILING, assertWithinCeiling } from './limits.js';

// add-ci-lint-api design D3, kind C (CG-PERF-02) — the ceiling read fails loudly instead of cutting.
describe('assertWithinCeiling', () => {
  it('returns the rows up to the ceiling (1,000)', () => {
    const rows = Array.from({ length: READ_ROW_CEILING }, (_, i) => i);
    expect(assertWithinCeiling(rows, 'test.read')).toBe(rows);
  });

  it('throws, naming the read, when a read gets the one row more', () => {
    const rows = Array.from({ length: READ_ROW_CEILING + 1 }, (_, i) => i);
    expect(() => assertWithinCeiling(rows, 'AssignmentsRepository.overlapping')).toThrow(
      'AssignmentsRepository.overlapping: more than 1000 rows (READ_ROW_CEILING)',
    );
  });
});

// add-payment-methods-admin task 1.4 — no source caps the payment methods, so a reorder's `ids` are bounded
// by the ceiling of the locked read (design D7): the shared constant must stay equal to it.
describe('PAYMENT_METHOD_ORDER_MAX', () => {
  it('equals READ_ROW_CEILING', () => {
    expect(PAYMENT_METHOD_ORDER_MAX).toBe(READ_ROW_CEILING);
  });
});
