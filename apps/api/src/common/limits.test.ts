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
