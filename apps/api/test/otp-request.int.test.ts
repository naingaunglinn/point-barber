import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BackgroundTasks } from '../src/common/http/background-tasks.js';
import { Mail, RateLimiter } from '../src/modules/platform/index.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';
import { OTP_REQUEST, codeJobs, requestCode } from './helpers/sign-in.js';

// add-foundation-auth-access tasks 5.2–5.3 — auth spec "A code request answers the same for every
// e-mail address" and "Code requests are limited to one per 60 seconds per address and 10 per hour
// per IP" (P1.AUTH.01 · P1-RULE-02 · D-AUTH-04 · API-LIM-02 · design D4 · D5).
const mmt = (local: string) => new Date(`${local}+06:30`);
const AUNG = FIXTURE_IDS.users.E004;
let t: SeededApp;

beforeAll(async () => {
  t = await startSeededApp({ now: mmt('2026-10-05T09:00:00') });
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.app.get(RateLimiter).reset();
});

const at = (local: string) => t.clock?.set(mmt(local));
const codesOf = (userId: string) =>
  t.prisma.login_otps.findMany({ where: { user_id: userId }, orderBy: { created_at: 'asc' } });

describe('add-foundation-auth-access · auth · A code request answers the same for every e-mail address', () => {
  it('Scenarios: Eligible barber · capital letters · unknown · deactivated — one answer, one code', async () => {
    at('2026-10-05T09:00:00');
    const before = (await codesOf(AUNG)).length;
    const jobsBefore = await codeJobs(t, 'aung@point.test');
    const answers = [];
    for (const [email, ip] of [
      ['aung@point.test', '203.0.113.1'],
      ['nobody@point.test', '203.0.113.2'],
      ['naing@point.test', '203.0.113.3'],
    ] as const) {
      const res = await requestCode(t, email, ip);
      answers.push({ status: res.status, body: res.body as unknown });
    }
    for (const answer of answers) {
      expect(answer).toStrictEqual({ status: 202, body: { resend_after_seconds: 60 } });
    }
    const rows = await codesOf(AUNG);
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({ expires_at: mmt('2026-10-05T09:05:00') });
    expect(rows.at(-1)?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await codeJobs(t, 'aung@point.test')).toBe(jobsBefore + 1);
    expect(await codeJobs(t, 'nobody@point.test')).toBe(0);
    expect(await codeJobs(t, 'naing@point.test')).toBe(0);
    expect(await t.prisma.login_otps.count({ where: { user_id: FIXTURE_IDS.users.E009 } })).toBe(0);
  });

  it('Scenario: Address typed with capital letters', async () => {
    at('2026-10-05T09:10:00');
    const before = (await codesOf(AUNG)).length;
    const res = await requestCode(t, 'Aung@Point.Test', '203.0.113.4');
    expect(res.status).toBe(202);
    expect(await codesOf(AUNG)).toHaveLength(before + 1);
  });

  it('`_` and `%` in an address are characters, not wildcards (PR #21 review item 1)', async () => {
    at('2026-10-05T09:15:00');
    const before = (await codesOf(AUNG)).length;
    const jobsBefore = await codeJobs(t, 'aung@point.test');
    for (const [email, ip] of [
      ['a_ng@point.test', '203.0.113.21'],
      ['____@point.test', '203.0.113.22'],
      ['%@point.test', '203.0.113.23'],
    ] as const) {
      expect((await requestCode(t, email, ip)).status).toBe(202);
    }
    expect(await codesOf(AUNG)).toHaveLength(before);
    expect(await codeJobs(t, 'aung@point.test')).toBe(jobsBefore);
  });

  it('a new code uses up the earlier unused ones', async () => {
    at('2026-10-05T09:20:00');
    await requestCode(t, 'aung@point.test', '203.0.113.5');
    const open = await t.prisma.login_otps.count({ where: { user_id: AUNG, consumed_at: null } });
    expect(open).toBe(1);
  });

  it('Scenario: Not an e-mail address', async () => {
    const res = await t.http.post(OTP_REQUEST).send({ email: 'aung' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation',
      errors: [{ field: 'email', code: 'email_invalid' }],
    });
  });

  it('Scenarios: 255 characters accepted, 256 refused', async () => {
    const ok = await t.http.post(OTP_REQUEST).send({ email: `${'a'.repeat(244)}@point.test` });
    expect(ok.status).toBe(202);
    expect(ok.body).toStrictEqual({ resend_after_seconds: 60 });
    const long = await t.http.post(OTP_REQUEST).send({ email: `${'a'.repeat(245)}@point.test` });
    expect(long.status).toBe(400);
    expect(long.body).toMatchObject({
      code: 'validation',
      errors: [{ field: 'email', code: 'too_big', params: { maximum: 255 } }],
    });
  });

  it('a request without the app header is refused by the CSRF check and creates no code', async () => {
    const before = (await codesOf(AUNG)).length;
    const res = await t.raw
      .post(OTP_REQUEST)
      .set('Origin', 'https://app.point.test')
      .send({ email: 'aung@point.test' });
    await t.app.get(BackgroundTasks).drain();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'csrf' });
    expect(await codesOf(AUNG)).toHaveLength(before);
  });
});

describe('add-foundation-auth-access · auth · Code requests are limited to one per 60 seconds per address and 10 per hour per IP', () => {
  it('Scenarios: Resend at 59 seconds is refused, at 60 seconds accepted', async () => {
    at('2026-10-05T11:00:00');
    expect((await requestCode(t, 'aung@point.test', '203.0.113.6')).status).toBe(202);
    const before = (await codesOf(AUNG)).length;
    at('2026-10-05T11:00:59');
    const early = await requestCode(t, 'aung@point.test', '203.0.113.6');
    expect(early.status).toBe(429);
    expect(early.body).toMatchObject({ code: 'rate_limited', retry_after: 1 });
    expect(early.headers['retry-after']).toBe('1');
    expect(await codesOf(AUNG)).toHaveLength(before);
    at('2026-10-05T11:01:00');
    expect((await requestCode(t, 'aung@point.test', '203.0.113.6')).status).toBe(202);
    expect(await codesOf(AUNG)).toHaveLength(before + 1);
  });

  it('Scenario: The cooldown is the same for an unknown address', async () => {
    at('2026-10-05T11:10:00');
    expect((await requestCode(t, 'nobody@point.test', '203.0.113.7')).status).toBe(202);
    at('2026-10-05T11:10:30');
    const res = await requestCode(t, 'nobody@point.test', '203.0.113.7');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: 'rate_limited', retry_after: 30 });
  });

  it('Scenarios: tenth request from one IP accepted, eleventh refused, the window slides', async () => {
    const ip = '203.0.113.10';
    const times = ['09:00', '09:03', '09:06', '09:09', '09:12', '09:15', '09:18', '09:21', '09:24'];
    for (const [i, time] of times.entries()) {
      at(`2026-10-06T${time}:00`);
      expect((await requestCode(t, `x${i}@point.test`, ip)).status).toBe(202);
    }
    at('2026-10-06T09:27:00');
    expect((await requestCode(t, 'x9@point.test', ip)).status).toBe(202);
    at('2026-10-06T09:45:00');
    const eleventh = await requestCode(t, 'x10@point.test', ip);
    expect(eleventh.status).toBe(429);
    expect(eleventh.body).toMatchObject({ code: 'rate_limited', retry_after: 900 });
    expect(eleventh.headers['retry-after']).toBe('900');
    at('2026-10-06T10:00:00');
    expect((await requestCode(t, 'x11@point.test', ip)).status).toBe(202);
  });

  it('a request refused for its address does not count for its IP', async () => {
    at('2026-10-07T09:00:00');
    const ip = '203.0.113.11';
    expect((await requestCode(t, 'y@point.test', ip)).status).toBe(202);
    for (let i = 0; i < 12; i += 1) {
      expect((await requestCode(t, 'y@point.test', ip)).status).toBe(429);
    }
    for (let i = 1; i < 10; i += 1) {
      expect((await requestCode(t, `y${i}@point.test`, ip)).status).toBe(202);
    }
  });

  it('after a limiter restart a staff and an unknown address get the same status', async () => {
    at('2026-10-07T10:00:00');
    await requestCode(t, 'aung@point.test', '203.0.113.12');
    await requestCode(t, 'nobody@point.test', '203.0.113.12');
    t.app.get(RateLimiter).reset();
    const staff = await requestCode(t, 'aung@point.test', '203.0.113.12');
    const unknown = await requestCode(t, 'nobody@point.test', '203.0.113.12');
    expect([staff.status, unknown.status]).toStrictEqual([202, 202]);
  });
});

describe('the issuing work runs after the answer (design D4)', () => {
  it('a failing mail step still answers 202 and logs the error', async () => {
    const failing = await startSeededApp({
      now: mmt('2026-10-05T09:00:00'),
      overrides: [
        {
          provide: Mail,
          useValue: { enqueue: () => Promise.reject(new Error('mail transport down')) },
        },
      ],
    });
    try {
      const res = await requestCode(failing, 'aung@point.test', '203.0.113.13');
      expect(res.status).toBe(202);
      expect(res.body).toStrictEqual({ resend_after_seconds: 60 });
      expect(failing.logs.some((line) => line.level === 50)).toBe(true);
      // The failed work rolled back: no code row.
      expect(await failing.prisma.login_otps.count({ where: { user_id: AUNG } })).toBe(0);
    } finally {
      await failing.close();
    }
  });
});
