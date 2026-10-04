import { describe, expect, it } from 'vitest';

import { requestLogLine } from './request-log.js';

// ADR-007 · CG-SEC-06 · design D5 — one line per request, never the query string.
describe('request log line', () => {
  const line = requestLogLine({
    request_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70',
    method: 'GET',
    originalUrl: '/api/v1/health?code=abc123&state=xyz789',
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
