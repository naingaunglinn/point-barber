import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, startTestApp } from './helpers/test-app.js';

// Spec "Every request has one request id" (API-ERR-01 · API-AUD-02) — task 4.3.
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('add-repo-scaffold · platform-runtime · Every request has one request id', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('Scenario: Server generates a UUIDv7', async () => {
    const res = await t.http.get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(UUID_V7);
  });

  it('Scenario: Two requests get two ids', async () => {
    const first = await t.http.get('/api/v1/health');
    const second = await t.http.get('/api/v1/health');
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('Scenario: A client UUID is honoured', async () => {
    const res = await t.http
      .get('/api/v1/health')
      .set('X-Request-Id', '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70');
    expect(res.headers['x-request-id']).toBe('0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70');
  });

  it('Scenario: A client UUID of another version is honoured', async () => {
    const res = await t.http
      .get('/api/v1/health')
      .set('X-Request-Id', '3f2b8c1e-5d4a-4f6b-9c7d-1a2b3c4d5e6f');
    expect(res.headers['x-request-id']).toBe('3f2b8c1e-5d4a-4f6b-9c7d-1a2b3c4d5e6f');
  });

  it('Scenario: A non-UUID value is ignored, not rejected', async () => {
    const res = await t.http.get('/api/v1/health').set('X-Request-Id', 'sale-42');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(UUID_V7);
    expect(res.headers['x-request-id']).not.toBe('sale-42');
  });

  it('an error response carries the id in the header and the body alike', async () => {
    const res = await t.http.get('/api/v1/does-not-exist');
    expect(res.headers['x-request-id']).toMatch(UUID_V7);
    expect(JSON.parse(res.text)).toMatchObject({ request_id: res.headers['x-request-id'] });
  });
});
