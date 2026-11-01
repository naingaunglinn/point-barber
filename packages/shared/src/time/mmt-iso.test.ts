import { afterEach, describe, expect, it, vi } from 'vitest';

import { toMmtIso } from './mmt-iso.js';

// add-walkin-visit-checkout task 3.8 — the one serializer of the instants the API returns
// (API-DATA-03 · D-PLT-15 · CG-TIME-04 / 05): ISO 8601, second precision, the offset of Asia/Yangon
// taken from the zone name, never a fixed offset. The same values pass under TZ=UTC,
// TZ=Asia/Yangon and TZ=America/Los_Angeles (`pnpm --filter @point/shared test:zones`).
afterEach(() => {
  vi.useRealTimers();
});

describe('toMmtIso', () => {
  it.each([
    ['2026-10-05T10:42:00+06:30', '2026-10-05T10:42:00+06:30'],
    // 17:30 UTC is midnight in Myanmar: the next Myanmar day.
    ['2026-10-04T17:30:00Z', '2026-10-05T00:00:00+06:30'],
    // UTC midnight is 06:30 in Myanmar.
    ['2026-10-05T00:00:00Z', '2026-10-05T06:30:00+06:30'],
    // The last second of the Myanmar day and of the month.
    ['2026-10-31T17:29:59Z', '2026-10-31T23:59:59+06:30'],
    // Milliseconds are dropped.
    ['2026-10-04T17:30:00.987Z', '2026-10-05T00:00:00+06:30'],
  ])('%s → %s', (instant, expected) => {
    expect(toMmtIso(new Date(instant))).toBe(expected);
    expect(toMmtIso(instant)).toBe(expected);
  });

  it('reads only the instant it is given, never the device clock (fake clock)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    expect(toMmtIso(new Date('2026-10-04T17:30:00Z'))).toBe('2026-10-05T00:00:00+06:30');
  });
});
