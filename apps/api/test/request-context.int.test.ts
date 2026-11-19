import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type TestPerson, cookieOf, createPerson, testCompany } from './helpers/people.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access task 2.1 — API-AUD-01 · D-AUD-02 · CG-DB-03 · design D3: a signed-in
// caller (a real session through the session guard of group 4) and a call before sign-in.
const REQUEST_ID = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';

let t: TestApp;
let aung: TestPerson;
beforeAll(async () => {
  t = await startTestApp();
  const prisma = t.app.get(PrismaService);
  aung = await createPerson(prisma, await testCompany(prisma));
});
afterAll(async () => {
  await t.close();
});

describe('add-foundation-auth-access · audit · Every changing request carries its user, session and request id into the database', () => {
  it('Scenario: Values inside a signed-in request', async () => {
    const res = await t.http
      .post('/api/v1/_fixtures/context')
      .set('X-Request-Id', REQUEST_ID)
      .set('Cookie', cookieOf(aung.token));
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      user_id: aung.userId,
      session_id: aung.sessionId,
      request_id: REQUEST_ID,
    });
  });

  it('Scenario: Values before sign-in', async () => {
    // A fresh application, so its pool has no connection on which an earlier transaction defined
    // the settings: "empty" must come from the runner itself, not from a reused connection.
    const fresh = await startTestApp();
    try {
      const res = await fresh.http.post('/api/v1/_fixtures/context/anonymous');
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({
        user_id: '',
        session_id: '',
        request_id: res.headers['x-request-id'],
      });
    } finally {
      await fresh.close();
    }
  });

  it('Scenario: Nothing leaks to the next transaction', async () => {
    await t.http.post('/api/v1/_fixtures/context').set('Cookie', cookieOf(aung.token));
    const prisma = t.app.get(PrismaService);
    // Whichever pool connection a later transaction gets, it sees none of the three values.
    for (let i = 0; i < 5; i += 1) {
      const [row] = await prisma.$transaction(
        (tx) => tx.$queryRaw<{ u: string | null; s: string | null; r: string | null }[]>`
          SELECT current_setting('app.user_id', true) AS u,
                 current_setting('app.session_id', true) AS s,
                 current_setting('app.request_id', true) AS r`,
      );
      expect([row?.u ?? null, row?.s ?? null, row?.r ?? null]).toStrictEqual([
        expect.toBeOneOf([null, '']),
        expect.toBeOneOf([null, '']),
        expect.toBeOneOf([null, '']),
      ]);
    }
  });
});
