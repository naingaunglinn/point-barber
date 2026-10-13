import { describe, expect, it } from 'vitest';

import { createLogger } from './logger.js';

// CG-OBS-03: the "never logged" request headers are redacted, with or without the req. wrapper.
function logged(object: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(loggedText(object)) as Record<string, unknown>;
}

function loggedText(object: Record<string, unknown>): string {
  const lines: string[] = [];
  createLogger('info', { write: (line: string) => void lines.push(line) }).info(object, 'x');
  return lines[0] ?? '{}';
}

const SECRETS = { cookie: 'sid=1', authorization: 'Bearer t', 'x-internal-key': 'k' };

describe('logger redaction', () => {
  it.each(Object.keys(SECRETS))('redacts req.headers.%s', (name) => {
    const line = logged({ req: { headers: SECRETS } }) as {
      req: { headers: Record<string, string> };
    };
    expect(line.req.headers[name]).toBe('[redacted]');
  });

  it.each(Object.keys(SECRETS))('redacts headers.%s', (name) => {
    const line = logged({ headers: SECRETS }) as { headers: Record<string, string> };
    expect(line.headers[name]).toBe('[redacted]');
  });
});

// add-foundation-auth-access task 2.6 — API-AUD-01 · CG-SEC-06 · design D7 · D8: the values of these
// keys never reach a log line, at the top level or nested up to three levels deep.
describe('logger redaction · sign-in and mail values (task 2.6)', () => {
  const KEYS = [
    'params',
    'code',
    'state',
    'token',
    'cookie',
    'set-cookie',
    'authorization',
    'x-internal-key',
  ];

  it.each(KEYS)('never prints the value of %s at any depth up to three levels', (key) => {
    const value = `SECRET-${key}`;
    const text = loggedText({
      [key]: value,
      a: { [key]: value },
      b: { c: { [key]: value } },
      d: { e: { f: { [key]: value } } },
    });
    expect(text).not.toContain(value);
    expect(text).toContain('[redacted]');
  });

  it('keeps the other members', () => {
    expect(
      logged({ request_id: 'r', job: { name: 'email.send', params: { code: '48291735' } } }),
    ).toMatchObject({ request_id: 'r', job: { name: 'email.send', params: '[redacted]' } });
  });
});
