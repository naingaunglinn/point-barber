import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, startTestApp } from './helpers/test-app.js';

// Spec "Errors are RFC 9457 problem details" and "An unknown route answers 404 not_found"
// (API-ERR-01 · API-ERR-02 · API-SHAPE-04) — task 4.5.
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('add-repo-scaffold · platform-runtime · Errors are RFC 9457 problem details', () => {
  it('Scenario: Shape of an error body', async () => {
    const res = await t.http
      .get('/api/v1/does-not-exist')
      .set('X-Request-Id', '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70');
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.headers['x-request-id']).toBe('0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70');
    expect(JSON.parse(res.text)).toStrictEqual({
      type: 'https://point.test/errors/not_found',
      title: 'Not found',
      status: 404,
      code: 'not_found',
      request_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70',
    });
  });

  it('Scenario: An unexpected failure hides its internals', async () => {
    t.logs.length = 0;
    const res = await t.http.get('/api/v1/_fixtures/boom');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    const body = JSON.parse(res.text) as Record<string, unknown>;
    expect(body).toMatchObject({
      code: 'internal_error',
      status: 500,
      request_id: res.headers['x-request-id'],
    });
    expect(res.text).not.toMatch(/boom/);
    expect(res.text).not.toMatch(/s3cret/);
    expect(res.text).not.toMatch(/\bat .+:\d+:\d+/); // no stack frame
    // D7: the body carries request_id and no detail at all.
    expect(Object.keys(body).sort()).toStrictEqual(
      ['code', 'request_id', 'status', 'title', 'type'].sort(),
    );

    const errors = t.logs.filter((line) => line.level === 50);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ request_id: res.headers['x-request-id'] });
    expect((errors[0]?.err as { message?: string }).message).toContain('boom');
  });
});

describe('add-repo-scaffold · platform-runtime · An unknown route answers 404 not_found', () => {
  it('Scenario: Unknown path', async () => {
    const res = await t.http.get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.text)).toMatchObject({ code: 'not_found', status: 404 });
  });

  it('Scenario: Known path, undefined method', async () => {
    const res = await t.http.post('/api/v1/health').send({});
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(JSON.parse(res.text)).toMatchObject({ code: 'not_found' });
  });
});
