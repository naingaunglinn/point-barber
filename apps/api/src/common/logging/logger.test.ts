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
  const KEYS = ['params', 'token', 'cookie', 'set-cookie', 'authorization', 'x-internal-key'];

  // `code` and `state` are common names (an error's code, a job's state): they are redacted only
  // where a sign-in code or the Google `state` travels — a request body or query (PR #16 review).
  it.each([
    ['body.code', { body: { code: '48291735' } }],
    ['req.body.code', { req: { body: { code: '48291735' } } }],
    ['query.code', { query: { code: '48291735' } }],
    ['req.query.code', { req: { query: { code: '48291735' } } }],
    ['query.state', { query: { state: '48291735' } }],
    ['req.query.state', { req: { query: { state: '48291735' } } }],
  ])('never prints %s', (_, object) => {
    expect(loggedText(object)).not.toContain('48291735');
  });

  it('keeps an error code and a problem code readable', () => {
    expect(
      logged({
        err: { code: 'P2002', message: 'Unique constraint failed' },
        problem: { code: 'not_found' },
      }),
    ).toMatchObject({ err: { code: 'P2002' }, problem: { code: 'not_found' } });
  });

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

// add-attachments-upload task 3.10 — "Links, keys and file contents never reach a log or an audit row"
// (CG-SEC-10 · design D9): a presigned link in a message, a field or an error loses its signature.
describe('logger redaction · presigned links (task 3.10)', () => {
  const LINK =
    'http://localhost:9000/point/att/2026/10/x/original.png?X-Amz-Credential=minio%2Fs3' +
    '&X-Amz-Expires=300&X-Amz-Signature=sig-9f8e7d6c&X-Amz-Security-Token=tok-77';

  it.each([
    ['a field', { url: LINK }],
    ['a nested field', { res: { body: { items: [{ url: LINK }] } } }],
    ['an error message and its stack', { err: new Error(`GET ${LINK} timed out`) }],
  ])('never prints the signature or the token in %s', (_, object) => {
    const text = loggedText(object);
    for (const secret of ['sig-9f8e7d6c', 'tok-77', 'minio%2Fs3'])
      expect(text).not.toContain(secret);
    expect(text).toContain('X-Amz-Expires=300');
  });

  it('never prints it in the message either, and keeps a Date readable', () => {
    const lines: string[] = [];
    const log = createLogger('info', { write: (line: string) => void lines.push(line) });
    log.info({ at: new Date('2026-10-05T03:35:00Z') }, `fetch ${LINK}`);
    expect(lines[0]).not.toContain('sig-9f8e7d6c');
    expect(lines[0]).toContain('2026-10-05T03:35:00.000Z');
  });
});
