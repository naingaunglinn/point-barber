import { SESSION_REQUEST_LIMIT, SESSION_REQUEST_WINDOW_SECONDS } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { RateLimiter } from '../src/modules/platform/index.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-staging-deploy tasks 3.1–3.2 — platform-runtime spec "Staff API requests are capped at 600 per
// minute per session" and "A request over the session cap runs nothing" (API-LIM-03 · API-ERR-02 ·
// API-AUD-01 · design D7). The first 590 of a session's requests are counted straight into the
// limiter's `session` bucket (the bucket the guard counts in); the last 10 of the 600 and every
// request after them go through the API.
const mmt = (local: string) => new Date(`${local}+06:30`);
const ME = '/api/v1/me';
let t: SeededApp;

beforeAll(async () => {
  t = await startSeededApp({ now: mmt('2026-10-05T10:05:00') });
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.app.get(RateLimiter).reset();
  t.clock?.set(mmt('2026-10-05T10:05:00'));
});

const at = (local: string) => t.clock?.set(mmt(local));

/** A signed-in session that has made 600 requests at 10:05:00 — the last 10 through the API. */
async function sessionAt600(person: 'E004' | 'E005' = 'E004') {
  const session = await t.signIn(person);
  const limiter = t.app.get(RateLimiter);
  for (let i = 0; i < SESSION_REQUEST_LIMIT - 10; i += 1) {
    limiter.hit(
      'session',
      session.sessionId,
      SESSION_REQUEST_LIMIT,
      SESSION_REQUEST_WINDOW_SECONDS,
    );
  }
  for (let i = 0; i < 10; i += 1) {
    expect((await t.http.get(ME).set('Cookie', session.cookie)).status).toBe(200);
  }
  return session;
}

describe('add-staging-deploy · platform-runtime · Staff API requests are capped at 600 per minute per session', () => {
  it('Scenarios: the 600th answered · the 601st refused · the next minute answered again', async () => {
    const aung = await sessionAt600();
    at('2026-10-05T10:05:31');
    const refused = await t.http.get(ME).set('Cookie', aung.cookie);
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ code: 'rate_limited', retry_after: 29 });
    expect(refused.headers['retry-after']).toBe('29');
    at('2026-10-05T10:06:00');
    expect((await t.http.get(ME).set('Cookie', aung.cookie)).status).toBe(200);
  });

  it('Scenario: Another phone in the same shop is not affected', async () => {
    await sessionAt600('E004');
    const min = await t.signIn('E005');
    at('2026-10-05T10:05:31');
    const res = await t.http
      .get(ME)
      .set('Cookie', min.cookie)
      .set('X-Forwarded-For', '203.0.113.9');
    expect(res.status).toBe(200);
  });

  it('Scenario: A request without a valid session is not counted', async () => {
    await sessionAt600();
    at('2026-10-05T10:05:31');
    const res = await t.http
      .get(ME)
      .set('Cookie', 'point_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'unauthenticated' });
  });

  it('a public endpoint is not counted', async () => {
    const aung = await sessionAt600();
    at('2026-10-05T10:05:31');
    expect((await t.http.get('/api/v1/health').set('Cookie', aung.cookie)).status).toBe(200);
  });
});

describe('add-staging-deploy · platform-runtime · A request over the session cap runs nothing', () => {
  it('Scenario: Sign-out over the cap does not sign out', async () => {
    const aung = await sessionAt600();
    const audit = await t.prisma.audit_events.count();
    at('2026-10-05T10:05:31');
    const res = await t.http.post('/api/v1/auth/logout').set('Cookie', aung.cookie);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: 'rate_limited' });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await t.prisma.audit_events.count()).toBe(audit);
    at('2026-10-05T10:06:00');
    expect((await t.http.get(ME).set('Cookie', aung.cookie)).status).toBe(200);
  });

  it('Scenario: A language change over the cap is not stored', async () => {
    await t.prisma.users.update({
      where: { id: FIXTURE_IDS.users.E004 },
      data: { ui_language: 1 },
    });
    const aung = await sessionAt600();
    at('2026-10-05T10:05:31');
    const res = await t.http.patch(ME).set('Cookie', aung.cookie).send({ ui_language: 2 });
    expect(res.status).toBe(429);
    expect(
      (await t.prisma.users.findUniqueOrThrow({ where: { id: FIXTURE_IDS.users.E004 } }))
        .ui_language,
    ).toBe(1);
  });

  it('logs one warn line per session per window, never the cookie', async () => {
    const aung = await sessionAt600();
    const before = t.logs.length;
    at('2026-10-05T10:05:31');
    for (let i = 0; i < 5; i += 1) await t.http.get(ME).set('Cookie', aung.cookie);
    const lines = t.logs.slice(before).filter((line) => line.msg === 'session request cap reached');
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain(aung.token);
    expect(JSON.stringify(lines)).not.toContain(aung.sessionId);
  });
});
