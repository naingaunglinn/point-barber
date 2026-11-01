import { describe, expect, it } from 'vitest';

import { SESSION_REQUEST_LIMIT, SESSION_REQUEST_WINDOW_SECONDS } from './limits.js';

// add-staging-deploy task 2.3 — the per-session cap of API-LIM-03: 600 requests per 60 seconds.
describe('fixed limits', () => {
  it('caps a session at 600 requests per minute', () => {
    expect(SESSION_REQUEST_LIMIT).toBe(600);
    expect(SESSION_REQUEST_WINDOW_SECONDS).toBe(60);
  });
});
