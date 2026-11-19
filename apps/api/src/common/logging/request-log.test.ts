import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import { RequestContext } from '../http/request-context.js';
import { createLogger } from './logger.js';
import { requestLogLine } from './request-log.js';
import { requestLogMiddleware } from './request-log.middleware.js';

// ADR-007 · CG-SEC-06 · design D5 — one line per request, never the query string.
describe('request log line', () => {
  const line = requestLogLine({
    request_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70',
    method: 'GET',
    originalUrl: '/api/v1/health?code=abc123&state=xyz789',
    route: undefined,
    status: 200,
    duration_ms: 12.6,
    client_ip: '203.0.113.7',
  });

  it('carries request_id, method, path, status, duration and client_ip', () => {
    expect(line).toEqual({
      request_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70',
      method: 'GET',
      path: '/api/v1/health',
      status: 200,
      duration_ms: 13,
      client_ip: '203.0.113.7',
    });
  });

  it('never contains the query string values', () => {
    const text = JSON.stringify(line);
    expect(text).not.toContain('abc123');
    expect(text).not.toContain('xyz789');
  });
});

// add-foundation-auth-access task 2.6 — design D7: the line carries the route pattern, so neither the
// callback's code and state nor an id in the path reach the log.
describe('request log line · route pattern (task 2.6)', () => {
  it('logs the matched route pattern instead of the path', () => {
    expect(
      requestLogLine({
        request_id: 'r',
        method: 'DELETE',
        originalUrl: '/api/v1/me/sessions/0199a3f2-0000-7000-8000-0000000005e4',
        route: '/api/v1/me/sessions/:id',
        status: 204,
        duration_ms: 1,
        client_ip: undefined,
      }).path,
    ).toBe('/api/v1/me/sessions/:id');
  });

  it('keeps the path without its query for an unmatched route', () => {
    expect(
      requestLogLine({
        request_id: 'r',
        method: 'GET',
        originalUrl: '/api/v1/nothing?token=t1',
        route: undefined,
        status: 404,
        duration_ms: 1,
        client_ip: undefined,
      }).path,
    ).toBe('/api/v1/nothing');
  });

  it('writes no secret of a Google callback request into the log output', () => {
    const output: string[] = [];
    const log = createLogger('info', { write: (text: string) => void output.push(text) });

    const finish: (() => void)[] = [];
    const req = {
      method: 'GET',
      originalUrl: '/api/v1/auth/google/callback?code=abc-google-code&state=def-state-value',
      baseUrl: '',
      route: { path: '/api/v1/auth/google/callback' },
      ip: '203.0.113.10',
      headers: { cookie: 'point_oauth_state=def-state-value; point_session=tok-session-value' },
    } as unknown as Request;
    const res = {
      statusCode: 302,
      on: (event: string, fn: () => void) => {
        if (event === 'finish') finish.push(fn);
      },
    } as unknown as Response;

    RequestContext.run({ request_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70' }, () => {
      requestLogMiddleware(log)(req, res, () => undefined);
    });
    for (const fn of finish) fn();

    const text = output.join('');
    expect(text).toContain('/api/v1/auth/google/callback');
    for (const secret of ['abc-google-code', 'def-state-value', 'tok-session-value']) {
      expect(text).not.toContain(secret);
    }
  });
});
