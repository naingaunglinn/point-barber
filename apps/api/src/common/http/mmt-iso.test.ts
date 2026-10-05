import { describe, expect, it } from 'vitest';

import { toMmtIso } from './mmt-iso.js';

// API-DATA-03 · D-PLT-15 · design D9 — ISO 8601, second precision, fixed +06:30.
describe('toMmtIso', () => {
  it('renders 05/Oct/2026 10:42:00 MMT as 2026-10-05T10:42:00+06:30', () => {
    expect(toMmtIso(new Date('2026-10-05T10:42:00+06:30'))).toBe('2026-10-05T10:42:00+06:30');
  });

  it('moves 2026-10-04T17:30:00Z to the next Myanmar day', () => {
    expect(toMmtIso(new Date('2026-10-04T17:30:00Z'))).toBe('2026-10-05T00:00:00+06:30');
  });

  it('keeps the last second of the Myanmar day', () => {
    expect(toMmtIso(new Date('2026-10-31T17:29:59Z'))).toBe('2026-10-31T23:59:59+06:30');
  });

  it('drops milliseconds', () => {
    expect(toMmtIso(new Date('2026-10-04T17:30:00.987Z'))).toBe('2026-10-05T00:00:00+06:30');
  });
});
