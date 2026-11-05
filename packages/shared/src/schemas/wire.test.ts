import { describe, expect, it } from 'vitest';

import { toDate } from '../time/instant.js';
import { wireDateTime } from './wire.js';

// API-DATA-03 — an instant on the wire is ISO 8601 with its offset. The schema refuses what `toDate`
// cannot read, so a hand-made request answers 400 `invalid_format`, never a 500 from a RangeError.

const issuesOf = (value: unknown) =>
  wireDateTime.safeParse(value).error?.issues.map(({ code, path }) => ({ code, path })) ?? [];

describe('wireDateTime', () => {
  it('seconds with 0, 3 and 9 fractional digits pass and are read by toDate', () => {
    for (const value of [
      '2026-10-05T09:00:00+06:30',
      '2026-10-05T09:00:00.000+06:30',
      '2026-10-05T09:00:00.123456789Z',
    ]) {
      expect(wireDateTime.parse(value)).toBe(value);
      expect(() => toDate(value)).not.toThrow();
    }
  });

  it('a fraction of 10 digits is one invalid_format, as toDate would throw', () => {
    for (const value of [
      '2026-10-05T09:00:00.1234567890+06:30',
      '2026-10-05T09:00:00.1234567890Z',
    ]) {
      expect(() => toDate(value)).toThrow(RangeError);
      expect(issuesOf(value)).toStrictEqual([{ code: 'invalid_format', path: [] }]);
    }
  });

  it('a malformed instant with a long fraction is still one issue', () => {
    expect(issuesOf('05/Oct/2026 09:00:00.1234567890')).toStrictEqual([
      { code: 'invalid_format', path: [] },
    ]);
  });
});
