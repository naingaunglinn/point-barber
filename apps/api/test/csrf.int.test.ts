import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { accessCalls } from './fixtures/access.controller.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-foundation-auth-access task 4.4 — auth spec "Changing requests need the app header and the app
// origin" (API-AUTH-02 · ADR-005 action item 4 · design D2). The changing request is the fixture
// `PUT /api/v1/_fixtures/mixed-value`, which Ma Hnin may call for B3; `PATCH /api/v1/me` and the code
// request arrive with groups 5 and 6 and repeat these scenarios.
const PATH = '/api/v1/_fixtures/mixed-value';
const BODY = { value: 30, branch_id: FIXTURE_IDS.branches.B3 };
const APP = 'https://app.point.test';
let t: SeededApp;
let hnin: { cookie: string };

beforeAll(async () => {
  t = await startSeededApp();
  hnin = await t.signIn('E002');
});
afterAll(async () => {
  await t.close();
});

const put = () => t.raw.put(PATH).set('Cookie', hnin.cookie);

async function refused(request: ReturnType<typeof put>): Promise<void> {
  const before = accessCalls.mixed;
  const res = await request.send(BODY);
  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({ code: 'csrf' });
  expect(accessCalls.mixed).toBe(before);
}

describe('add-foundation-auth-access · auth · Changing requests need the app header and the app origin', () => {
  it('Scenario: Header missing', async () => {
    await refused(put().set('Origin', APP));
  });

  it('Scenario: Header with another value', async () => {
    await refused(put().set('X-Requested-With', 'XMLHttpRequest').set('Origin', APP));
  });

  it("Scenario: Request from the public website's origin", async () => {
    await refused(put().set('X-Requested-With', 'point-app').set('Origin', 'https://point.test'));
  });

  it('Scenario: Neither Origin nor Referer', async () => {
    await refused(put().set('X-Requested-With', 'point-app'));
  });

  it('Scenario: Referer is used when Origin is absent', async () => {
    const res = await put()
      .set('X-Requested-With', 'point-app')
      .set('Referer', 'https://app.point.test/')
      .send(BODY);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ value: 30 });
  });

  it('a Referer of another origin is refused', async () => {
    await refused(
      put()
        .set('X-Requested-With', 'point-app')
        .set('Referer', 'https://point.test/app.point.test'),
    );
  });

  it('Scenario: Reading needs no header', async () => {
    const res = await t.raw.get('/api/v1/_fixtures/staff-read').set('Cookie', hnin.cookie);
    expect(res.status).toBe(200);
  });

  it('a request without a session is refused by the CSRF check first', async () => {
    const res = await t.raw.post('/api/v1/_fixtures/context').set('Origin', APP);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'csrf' });
  });

  it('Scenario: The code request is protected too — a public changing endpoint is checked', async () => {
    const res = await t.raw.post('/api/v1/_fixtures/context/anonymous');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'csrf' });
  });

  it("the public website's API (/v1/public/*) is not checked", async () => {
    const res = await t.raw.post('/api/v1/public/_fixtures/ping');
    expect(res.status).toBe(200);
  });

  it('an @Internal() route is not checked', async () => {
    const res = await t.raw
      .post('/api/v1/_fixtures/internal')
      .set('X-Internal-Key', 'o'.repeat(16));
    expect(res.status).toBe(200);
  });
});
