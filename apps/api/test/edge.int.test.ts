import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, startTestApp } from './helpers/test-app.js';

// Cross-cutting HTTP rules (API-SHAPE-01 · API-SHAPE-03 · API-SHAPE-04 · API-SHAPE-05 · D-DB-01) —
// task 4.15. The host-level scenarios (Caddy) are e2e/edge.spec.ts, not here.
const SNAKE = /^[a-z][a-z0-9_]*$/;
const CORS_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
];

/** Every member name at every depth (array items included). */
function memberNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(memberNames);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...memberNames(child)]);
}

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('add-repo-scaffold · platform-runtime · JSON member names are snake_case', () => {
  it('Scenario: Status body', async () => {
    const res = await t.http.get('/api/v1/system/status');
    expect(Object.keys(res.body as object).sort()).toStrictEqual(
      ['maintenance', 'message_en', 'message_mm', 'server_time', 'until', 'version'].sort(),
    );
    expect(res.body).not.toHaveProperty('serverTime');
    expect(res.body).not.toHaveProperty('messageMm');
    expect(res.body).not.toHaveProperty('messageEn');
    for (const name of memberNames(res.body)) expect(name).toMatch(SNAKE);
  });

  it('Scenario: Problem body', async () => {
    const res = await t.http.get('/api/v1/does-not-exist');
    const body = JSON.parse(res.text) as Record<string, unknown>;
    expect(body).toHaveProperty('request_id');
    expect(body).not.toHaveProperty('requestId');
    for (const name of memberNames(body)) expect(name).toMatch(SNAKE);
  });

  it('a validation problem body is snake_case at every depth', async () => {
    const res = await t.http.post('/api/v1/_fixtures/items').send({ name: '', items: [] });
    const names = memberNames(JSON.parse(res.text));
    expect(names).toContain('params');
    for (const name of names) expect(name).toMatch(SNAKE);
  });
});

describe('add-repo-scaffold · platform-runtime · No CORS middleware is registered', () => {
  it('Scenario: A cross-origin read gets no CORS header', async () => {
    const res = await t.http.get('/api/v1/health').set('Origin', 'https://point.test');
    expect(res.status).toBe(200);
    expect(res.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('Scenario: A preflight is not answered', async () => {
    const res = await t.http
      .options('/api/v1/health')
      .set('Origin', 'https://evil.test')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.text)).toMatchObject({ code: 'not_found' });
    for (const header of CORS_HEADERS) expect(res.headers).not.toHaveProperty(header);
    expect(res.headers).not.toHaveProperty('allow');
  });
});

describe("add-repo-scaffold · platform-runtime · API is served under /api/v1 on the web app's own origin", () => {
  it('Scenario: No second version exists', async () => {
    const res = await t.http.get('/api/v2/health');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(JSON.parse(res.text)).toMatchObject({ code: 'not_found' });
  });

  it('a doubled version segment is not a route', async () => {
    const res = await t.http.get('/api/v1/v1/health');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.text)).toMatchObject({ code: 'not_found' });
  });

  // Caddy sends /rt* to the API (add-realtime-gateway, D12), so a path outside /api can reach it;
  // it must still answer the problem 404, not Express's HTML page (PR #6 review · task 8.7).
  it.each(['/v1/health', '/rt', '/rt/socket', '/'])(
    'a path outside /api answers the problem 404: %s',
    async (path) => {
      const res = await t.http.get(path);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(JSON.parse(res.text)).toMatchObject({ code: 'not_found', status: 404 });
    },
  );

  it('the framework does not announce itself', async () => {
    const res = await t.http.get('/api/v1/health');
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });
});

describe('add-repo-scaffold · platform-runtime · The API speaks JSON only', () => {
  it('Scenario: Success response media type', async () => {
    const res = await t.http.get('/api/v1/system/status');
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
  });
});
