import { describe, expect, it } from 'vitest';

import { systemStatusSchema } from './system-status.js';

// P1.SYS.02 — exactly six members.
const status = {
  maintenance: false,
  until: null,
  message_mm: null,
  message_en: null,
  version: '0.1.0',
  server_time: '2026-10-05T10:42:00+06:30',
};

describe('systemStatusSchema', () => {
  it('accepts the default status of the spec', () => {
    expect(systemStatusSchema.parse(status)).toEqual(status);
  });

  it('accepts a maintenance window', () => {
    const body = {
      ...status,
      maintenance: true,
      until: '2026-10-05T12:00:00+06:30',
      message_en: 'Back soon',
    };
    expect(systemStatusSchema.parse(body)).toEqual(body);
  });

  it.each(['maintenance', 'version', 'server_time'])('requires %s', (member) => {
    const body: Record<string, unknown> = { ...status };
    delete body[member];
    expect(systemStatusSchema.safeParse(body).success).toBe(false);
  });

  it('refuses camelCase members', () => {
    expect(
      systemStatusSchema.safeParse({ ...status, serverTime: status.server_time }).success,
    ).toBe(false);
  });
});
