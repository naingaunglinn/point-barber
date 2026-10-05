import { describe, expect, it } from 'vitest';

import { healthSchema } from './health.js';

// P1.SYS.01 — exactly two members.
describe('healthSchema', () => {
  it.each(['ok', 'degraded'])('accepts status %s', (status) => {
    expect(healthSchema.parse({ status, time: '2026-10-05T10:42:00+06:30' })).toEqual({
      status,
      time: '2026-10-05T10:42:00+06:30',
    });
  });

  it('refuses another status', () => {
    expect(
      healthSchema.safeParse({ status: 'down', time: '2026-10-05T10:42:00+06:30' }).success,
    ).toBe(false);
  });

  it('refuses a third member', () => {
    expect(
      healthSchema.safeParse({ status: 'ok', time: '2026-10-05T10:42:00+06:30', db: 'up' }).success,
    ).toBe(false);
  });

  it('requires an ISO 8601 time with an offset', () => {
    expect(healthSchema.safeParse({ status: 'ok', time: '05/Oct/2026 10:42' }).success).toBe(false);
  });
});
