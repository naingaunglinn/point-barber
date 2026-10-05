import { describe, expect, it } from 'vitest';

import { createLogger } from './logger.js';

// CG-OBS-03: the "never logged" request headers are redacted, with or without the req. wrapper.
function logged(object: Record<string, unknown>): Record<string, unknown> {
  const lines: string[] = [];
  createLogger('info', { write: (line: string) => void lines.push(line) }).info(object, 'x');
  return JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
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
