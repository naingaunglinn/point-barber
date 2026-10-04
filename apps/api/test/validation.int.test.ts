import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCalls } from './fixtures/fixtures.controller.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// Spec "A schema failure answers 400 validation with field errors", "The API speaks JSON only" and
// "List limit is 1 to 100, default 25" (API-ERR-02 · API-ERR-03 · API-SHAPE-05 · API-LIM-03) —
// tasks 4.7 and 4.8, on the fixture endpoints of the test application.
const problemOf = (text: string): Record<string, unknown> =>
  JSON.parse(text) as Record<string, unknown>;

describe('add-repo-scaffold · platform-runtime · A schema failure answers 400 validation with field errors', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(() => {
    fixtureCalls.create = 0;
  });

  it('Scenario: A nested field of the wrong type', async () => {
    const res = await t.http
      .post('/api/v1/_fixtures/items')
      .send({ name: 'Haircut', items: [{ quantity: 1 }, { quantity: 'two' }] });
    expect(res.status).toBe(400);
    const body = problemOf(res.text);
    expect(body.code).toBe('validation');
    expect(body.errors).toStrictEqual([
      { field: 'items[1].quantity', code: 'invalid_type', params: { expected: 'number' } },
    ]);
    expect(fixtureCalls.create).toBe(0);
  });

  it('Scenario: Two fields fail — two items', async () => {
    const res = await t.http.post('/api/v1/_fixtures/items').send({ name: '', items: [] });
    expect(res.status).toBe(400);
    const body = problemOf(res.text);
    expect(body.code).toBe('validation');
    expect(body.errors).toHaveLength(2);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        { field: 'name', code: 'too_small', params: { minimum: 1 } },
        { field: 'items', code: 'too_small', params: { minimum: 1 } },
      ]),
    );
  });

  it('Scenario: A missing field is reported with the Zod issue name, not "required"', async () => {
    const res = await t.http.post('/api/v1/_fixtures/items').send({ items: [{ quantity: 1 }] });
    expect(res.status).toBe(400);
    const body = problemOf(res.text);
    expect(body.code).toBe('validation');
    expect(body.errors).toStrictEqual([
      { field: 'name', code: 'invalid_type', params: { expected: 'string' } },
    ]);
    expect(res.text).not.toMatch(/"required"/);
  });

  it('Scenario: A catalogue code named by the schema wins over the Zod issue name', async () => {
    const res = await t.http
      .post('/api/v1/_fixtures/items')
      .send({ name: 'Haircut', items: [{ quantity: 1 }], phone: '12345' });
    expect(res.status).toBe(400);
    const body = problemOf(res.text);
    expect(body.code).toBe('validation');
    expect(body.errors).toStrictEqual([{ field: 'phone', code: 'phone_invalid' }]);
  });

  it('Scenario: Body is not JSON at all', async () => {
    t.logs.length = 0;
    const res = await t.http
      .post('/api/v1/_fixtures/items')
      .set('Content-Type', 'application/json')
      .send('{"name": "Haircut", "items": [');
    expect(res.status).toBe(400);
    const body = problemOf(res.text);
    expect(body.code).toBe('validation');
    expect(body.errors).toStrictEqual([]);
    // A client mistake, not a server failure: no error log line.
    expect(t.logs.filter((line) => line.level === 50)).toStrictEqual([]);
  });

  it('Scenario: Body above the JSON size limit', async () => {
    const head = '{"name":"';
    const tail = '","items":[{"quantity":1}]}';
    const text = head + 'a'.repeat(1_048_577 - head.length - tail.length) + tail;
    expect(Buffer.byteLength(text)).toBe(1_048_577);
    expect(() => JSON.parse(text) as unknown).not.toThrow();

    const res = await t.http
      .post('/api/v1/_fixtures/items')
      .set('Content-Type', 'application/json')
      .send(text);
    expect(res.status).toBe(400);
    const body = problemOf(res.text);
    expect(body.code).toBe('validation');
    expect(body.errors).toStrictEqual([]);
    expect(fixtureCalls.create).toBe(0);
  });

  it('a JSON body at exactly the limit is read', async () => {
    const head = '{"name":"';
    const tail = '","items":[{"quantity":1}]}';
    const text = head + 'a'.repeat(1_048_576 - head.length - tail.length) + tail;
    const res = await t.http
      .post('/api/v1/_fixtures/items')
      .set('Content-Type', 'application/json')
      .send(text);
    expect(res.status).toBe(201);
    expect(fixtureCalls.create).toBe(1);
  });

  it('a valid body reaches the handler once', async () => {
    const res = await t.http
      .post('/api/v1/_fixtures/items')
      .send({ name: 'Haircut', items: [{ quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(fixtureCalls.create).toBe(1);
  });
});

describe('add-repo-scaffold · platform-runtime · The API speaks JSON only', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(() => {
    fixtureCalls.create = 0;
  });

  it('Scenario: A form-encoded body is not read', async () => {
    const res = await t.http
      .post('/api/v1/_fixtures/items')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('name=Haircut');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(problemOf(res.text).code).toBe('validation');
    expect(fixtureCalls.create).toBe(0);
  });
});

describe('add-repo-scaffold · platform-runtime · List limit is 1 to 100, default 25', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('Scenario: Absent limit is 25', async () => {
    const res = await t.http.get('/api/v1/_fixtures/items');
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ limit: 25 });
  });

  it('Scenario: At the upper limit', async () => {
    const res = await t.http.get('/api/v1/_fixtures/items?limit=100');
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ limit: 100 });
  });

  it('Scenario: Just above the upper limit', async () => {
    const res = await t.http.get('/api/v1/_fixtures/items?limit=101');
    expect(res.status).toBe(400);
    const body = problemOf(res.text);
    expect(body.code).toBe('validation');
    expect(body.errors).toStrictEqual([
      { field: 'limit', code: 'too_big', params: { maximum: 100 } },
    ]);
  });

  it('Scenario: At the lower limit', async () => {
    const res = await t.http.get('/api/v1/_fixtures/items?limit=1');
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ limit: 1 });
  });

  it('Scenario: Just below the lower limit', async () => {
    const res = await t.http.get('/api/v1/_fixtures/items?limit=0');
    expect(res.status).toBe(400);
    const body = problemOf(res.text);
    expect(body.code).toBe('validation');
    expect(body.errors).toStrictEqual([
      { field: 'limit', code: 'too_small', params: { minimum: 1 } },
    ]);
  });

  it('Scenario: Not a number', async () => {
    const res = await t.http.get('/api/v1/_fixtures/items?limit=abc');
    expect(res.status).toBe(400);
    const body = problemOf(res.text);
    expect(body.code).toBe('validation');
    expect(body.errors).toStrictEqual([
      { field: 'limit', code: 'invalid_type', params: { expected: 'number' } },
    ]);
  });
});
