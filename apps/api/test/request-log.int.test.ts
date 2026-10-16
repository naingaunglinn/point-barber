import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access task 2.6 — design D7: the real request log line carries the matched route
// pattern, without the query string, and no id or token from the URL.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('request log line of the running application (task 2.6)', () => {
  it('logs the route pattern, not the id or the query', async () => {
    t.logs.length = 0;
    const id = 'id-0199a3f2-secret-path-value';
    const res = await t.http.get(
      `/api/v1/_fixtures/items/${id}?token=tok-query-value&code=48291735`,
    );
    expect(res.status).toBe(200);
    const lines = t.logs.filter((line) => line.msg === 'request');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      method: 'GET',
      path: '/api/v1/_fixtures/items/:id',
      status: 200,
    });
    const text = JSON.stringify(t.logs);
    for (const secret of [id, 'tok-query-value', '48291735']) expect(text).not.toContain(secret);
  });
});
