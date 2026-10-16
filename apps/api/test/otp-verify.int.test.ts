import { meResponseSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { RateLimiter } from '../src/modules/platform/index.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';
import { latestCode, requestCode, sessionCookieOf, verify } from './helpers/sign-in.js';

// add-foundation-auth-access tasks 5.1, 5.4–5.6, 5.8 — auth spec "A code is 8 digits, valid for 5
// minutes, usable once, and only the latest one counts", "Five wrong codes in a row lock code sign-in
// for 20 minutes", "Code verify is limited to 10 attempts per hour per IP", "The first successful
// sign-in activates an invited user"; audit spec "Sign-in successes, failures and locks are audited"
// (P1-RULE-02 / 03 / 10 · API-LIM-02 · design D3 · D4 · D5 · D12).
const mmt = (local: string) => new Date(`${local}+06:30`);
const U = FIXTURE_IDS.users;
let t: SeededApp;

beforeAll(async () => {
  t = await startSeededApp({ now: mmt('2026-10-05T09:00:00') });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.app.get(RateLimiter).reset();
  await t.prisma.users.updateMany({ data: { failed_login_count: 0, login_locked_until: null } });
});

const at = (local: string) => t.clock?.set(mmt(local));
const userRow = (id: string) => t.prisma.users.findUniqueOrThrow({ where: { id } });
async function codeFor(email: string, local: string, ip = '203.0.113.50'): Promise<string> {
  at(local);
  t.app.get(RateLimiter).reset();
  expect((await requestCode(t, email, ip)).status).toBe(202);
  const code = await latestCode(t, email);
  if (code === undefined) throw new Error(`no code for ${email}`);
  return code;
}
const wrong = (code: string) => (code === '11112222' ? '22223333' : '11112222');
const rowsOf = async (action: string, entityId: string | null) =>
  t.prisma.audit_events.findMany({
    where: { action, entity_id: entityId },
    orderBy: { occurred_at: 'asc' },
  });

describe('add-foundation-auth-access · auth · A code is 8 digits, valid for 5 minutes, usable once, and only the latest one counts', () => {
  it('Scenarios: Accepted at 4:59 · the code is not stored · a used code cannot be used again', async () => {
    const code = await codeFor('aung@point.test', '2026-10-05T09:00:00');
    const row = await t.prisma.login_otps.findFirstOrThrow({
      where: { user_id: U.E004 },
      orderBy: { created_at: 'desc' },
    });
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(code);

    at('2026-10-05T09:04:59');
    const res = await verify(t, 'aung@point.test', code);
    expect(res.status).toBe(200);
    expect(meResponseSchema.safeParse(res.body).success).toBe(true);
    expect(sessionCookieOf(res)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      (await t.prisma.login_otps.findUniqueOrThrow({ where: { id: row.id } })).consumed_at,
    ).toStrictEqual(mmt('2026-10-05T09:04:59'));

    at('2026-10-05T09:04:59');
    const again = await verify(t, 'aung@point.test', code);
    expect(again.status).toBe(401);
    expect(again.body).toMatchObject({ code: 'otp_invalid' });
  });

  it('Scenarios: Refused at exactly 5 minutes and at 5 minutes 1 second', async () => {
    const code = await codeFor('aung@point.test', '2026-10-05T10:00:00');
    const sessions = await t.prisma.user_sessions.count({ where: { user_id: U.E004 } });
    for (const time of ['10:05:00', '10:05:01']) {
      at(`2026-10-05T${time}`);
      const res = await verify(t, 'aung@point.test', code);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'otp_invalid' });
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(await t.prisma.user_sessions.count({ where: { user_id: U.E004 } })).toBe(sessions);
  });

  it('Scenario: Only the latest code works', async () => {
    const a = await codeFor('aung@point.test', '2026-10-05T11:00:00');
    const b = await codeFor('aung@point.test', '2026-10-05T11:01:30');
    at('2026-10-05T11:02:00');
    expect((await verify(t, 'aung@point.test', a)).status).toBe(401);
    at('2026-10-05T11:02:30');
    expect((await verify(t, 'aung@point.test', b)).status).toBe(200);
  });

  it('Scenario: Unknown address looks like a wrong code', async () => {
    await codeFor('aung@point.test', '2026-10-05T12:00:00');
    const unknown = await verify(t, 'nobody@point.test', '12345678');
    const wrongCode = await verify(t, 'aung@point.test', '12345678');
    expect(unknown.status).toBe(401);
    expect(Object.keys(unknown.body).sort()).toStrictEqual(
      ['code', 'request_id', 'status', 'title', 'type'].sort(),
    );
    expect(Object.keys(unknown.body).sort()).toStrictEqual(Object.keys(wrongCode.body).sort());
    expect(unknown.body.code).toBe('otp_invalid');
  });

  it('Scenarios: seven and nine digits fail the schema without touching the counter', async () => {
    for (const code of ['1234567', '123456789']) {
      const res = await verify(t, 'aung@point.test', code);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        code: 'validation',
        errors: [{ field: 'code', code: 'otp_format' }],
      });
    }
    expect((await userRow(U.E004)).failed_login_count).toBe(0);
  });
});

describe('add-foundation-auth-access · auth · Five wrong codes in a row lock code sign-in for 20 minutes', () => {
  it('Scenarios: 4 × invalid · fifth locks · right code refused · still locked at 9:33:59 · lock ends at 9:34', async () => {
    const code = await codeFor('min@point.test', '2026-10-08T09:10:00');
    for (const time of ['09:10:30', '09:11:00', '09:11:30', '09:12:00']) {
      at(`2026-10-08T${time}`);
      const res = await verify(t, 'min@point.test', wrong(code));
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'otp_invalid' });
    }
    expect(await userRow(U.E005)).toMatchObject({
      failed_login_count: 4,
      login_locked_until: null,
    });

    at('2026-10-08T09:14:00');
    const fifth = await verify(t, 'min@point.test', wrong(code));
    expect(fifth.status).toBe(401);
    expect(fifth.body).toMatchObject({ code: 'login_locked', until: '2026-10-08T09:34:00+06:30' });
    expect(await userRow(U.E005)).toMatchObject({
      failed_login_count: 5,
      login_locked_until: mmt('2026-10-08T09:34:00'),
    });

    at('2026-10-08T09:14:30');
    const right = await verify(t, 'min@point.test', code);
    expect(right.body).toMatchObject({ code: 'login_locked', until: '2026-10-08T09:34:00+06:30' });
    expect(right.headers['set-cookie']).toBeUndefined();
    expect((await userRow(U.E005)).failed_login_count).toBe(5);
    expect(await t.prisma.login_otps.count({ where: { user_id: U.E005, consumed_at: null } })).toBe(
      1,
    );

    const fresh = await codeFor('min@point.test', '2026-10-08T09:33:30', '203.0.113.51');
    at('2026-10-08T09:33:59');
    expect((await verify(t, 'min@point.test', fresh)).body).toMatchObject({ code: 'login_locked' });
    at('2026-10-08T09:34:00');
    const signedIn = await verify(t, 'min@point.test', fresh);
    expect(signedIn.status).toBe(200);
    expect((await userRow(U.E005)).failed_login_count).toBe(0);

    // The audit rows of the fifth failure: login.failed and login.locked, kept although it answered 401.
    const locks = await rowsOf('login.locked', U.E005);
    expect(locks.at(-1)).toMatchObject({
      branch_id: null,
      after_data: { until: '2026-10-08T09:34:00+06:30' },
    });
  });

  it('Scenario: A wrong code after the lock locks again at once', async () => {
    await t.prisma.users.update({
      where: { id: U.E005 },
      data: { failed_login_count: 5, login_locked_until: mmt('2026-10-09T09:34:00') },
    });
    const code = await codeFor('min@point.test', '2026-10-09T09:34:30');
    at('2026-10-09T09:35:00');
    const res = await verify(t, 'min@point.test', wrong(code));
    expect(res.body).toMatchObject({ code: 'login_locked', until: '2026-10-09T09:55:00+06:30' });
    expect((await userRow(U.E005)).failed_login_count).toBe(6);
  });

  it('Scenario: Failures are counted across codes', async () => {
    const a = await codeFor('htet@point.test', '2026-10-10T09:00:00');
    for (let i = 0; i < 3; i += 1)
      expect((await verify(t, 'htet@point.test', wrong(a))).status).toBe(401);
    const b = await codeFor('htet@point.test', '2026-10-10T09:02:00');
    expect((await verify(t, 'htet@point.test', wrong(b))).body).toMatchObject({
      code: 'otp_invalid',
    });
    expect((await verify(t, 'htet@point.test', wrong(b))).body).toMatchObject({
      code: 'login_locked',
    });
  });

  it('Scenario: A success resets the count', async () => {
    const a = await codeFor('thura@point.test', '2026-10-11T09:00:00');
    for (let i = 0; i < 4; i += 1) await verify(t, 'thura@point.test', wrong(a));
    expect((await verify(t, 'thura@point.test', a)).status).toBe(200);
    expect((await userRow(U.E007)).failed_login_count).toBe(0);
    const b = await codeFor('thura@point.test', '2026-10-11T10:00:00');
    let last;
    for (let i = 0; i < 4; i += 1) last = await verify(t, 'thura@point.test', wrong(b));
    expect(last?.body).toMatchObject({ code: 'otp_invalid' });
  });

  it('10 parallel wrong codes: 5 invalid, 5 locked, one login.locked row, count 5 (task 5.5)', async () => {
    const code = await codeFor('htet@point.test', '2026-10-12T09:00:00');
    const locksBefore = (await rowsOf('login.locked', U.E006)).length;
    const failedBefore = (await rowsOf('login.failed', U.E006)).length;
    const answers = await Promise.all(
      Array.from({ length: 10 }, () => verify(t, 'htet@point.test', wrong(code))),
    );
    const codes = answers.map((res) => (res.body as { code: string }).code).sort();
    expect(codes).toStrictEqual([
      ...Array(5).fill('login_locked'),
      ...Array(5).fill('otp_invalid'),
    ]);
    expect((await userRow(U.E006)).failed_login_count).toBe(5);
    expect(await rowsOf('login.locked', U.E006)).toHaveLength(locksBefore + 1);
    expect(await rowsOf('login.failed', U.E006)).toHaveLength(failedBefore + 10);
  });
});

describe('add-foundation-auth-access · auth · Code verify is limited to 10 attempts per hour per IP', () => {
  it('Scenarios: tenth processed · eleventh refused before any look-up · a right code is refused and kept · another IP signs in · the window slides', async () => {
    const ip = '203.0.113.10';
    const times = ['09:00', '09:03', '09:06', '09:09', '09:12', '09:15', '09:18', '09:21', '09:24'];
    for (const time of times) {
      at(`2026-10-13T${time}:00`);
      expect((await verify(t, 'nobody@point.test', '12345678', { ip })).status).toBe(401);
    }
    at('2026-10-13T09:27:00');
    const tenth = await verify(t, 'min@point.test', '11112222', { ip });
    expect(tenth.body).toMatchObject({ code: 'otp_invalid' });
    expect((await userRow(U.E005)).failed_login_count).toBe(1);

    at('2026-10-13T09:45:00');
    const auditBefore = await t.prisma.audit_events.count();
    const eleventh = await verify(t, 'min@point.test', '11112222', { ip });
    expect(eleventh.status).toBe(429);
    expect(eleventh.body).toMatchObject({ code: 'rate_limited', retry_after: 900 });
    expect(eleventh.headers['retry-after']).toBe('900');
    expect((await userRow(U.E005)).failed_login_count).toBe(1);
    expect(await t.prisma.audit_events.count()).toBe(auditBefore);

    // A right code from the capped IP: refused, not used up. The code is requested from another IP.
    at('2026-10-13T09:44:00');
    expect((await requestCode(t, 'aung@point.test', '203.0.113.30')).status).toBe(202);
    const code = await latestCode(t, 'aung@point.test');
    at('2026-10-13T09:46:00');
    const capped = await verify(t, 'aung@point.test', code ?? '', { ip });
    expect(capped.status).toBe(429);
    expect(capped.body).toMatchObject({ retry_after: 840 });
    expect(capped.headers['set-cookie']).toBeUndefined();
    expect(await t.prisma.login_otps.count({ where: { user_id: U.E004, consumed_at: null } })).toBe(
      1,
    );

    at('2026-10-13T09:46:30');
    const other = await verify(t, 'aung@point.test', code ?? '', { ip: '203.0.113.20' });
    expect(other.status).toBe(200);
    expect(sessionCookieOf(other)).toBeDefined();

    at('2026-10-13T10:00:00');
    expect((await verify(t, 'nobody@point.test', '12345678', { ip })).body).toMatchObject({
      code: 'otp_invalid',
    });
  });
});

describe('add-foundation-auth-access · auth · The first successful sign-in activates an invited user', () => {
  it("Scenarios: Ma Thida's first sign-in · her second changes only the last-login time", async () => {
    const first = await codeFor('thida@point.test', '2026-10-14T09:29:00');
    at('2026-10-14T09:30:00');
    const res = await verify(t, 'thida@point.test', first);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { status: 1 } });
    expect(await userRow(U.E008)).toMatchObject({
      status: 1,
      activated_at: mmt('2026-10-14T09:30:00'),
      last_login_at: mmt('2026-10-14T09:30:00'),
    });
    const second = await codeFor('thida@point.test', '2026-10-14T10:59:00');
    at('2026-10-14T11:00:00');
    expect((await verify(t, 'thida@point.test', second)).status).toBe(200);
    expect(await userRow(U.E008)).toMatchObject({
      activated_at: mmt('2026-10-14T09:30:00'),
      last_login_at: mmt('2026-10-14T11:00:00'),
    });
  });
});

describe('add-foundation-auth-access · audit · Sign-in successes, failures and locks are audited', () => {
  it('Scenarios: Successful code sign-in · Wrong code · Unknown address', async () => {
    const code = await codeFor('aung@point.test', '2026-10-15T09:01:00');
    at('2026-10-15T09:02:00');
    const res = await verify(t, 'aung@point.test', code);
    const session = await t.prisma.user_sessions.findFirstOrThrow({
      where: { user_id: U.E004 },
      orderBy: { created_at: 'desc' },
    });
    expect(res.status).toBe(200);
    expect((await rowsOf('login.success', U.E004)).at(-1)).toMatchObject({
      entity_type: 'users',
      actor_user_id: U.E004,
      actor_session_id: session.id,
      branch_id: null,
      after_data: { method: 'otp', device_label: 'Android · Chrome' },
    });
    expect(session).toMatchObject({ login_method: 2, device_label: 'Android · Chrome' });

    await codeFor('min@point.test', '2026-10-15T09:10:00');
    await verify(t, 'min@point.test', '11112222', { ip: '203.0.113.10' });
    const failed = (await rowsOf('login.failed', U.E005)).at(-1);
    expect(failed).toMatchObject({
      actor_user_id: null,
      after_data: { ip: '203.0.113.10', method: 'otp', cause: 'wrong_code' },
    });
    expect((failed?.after_data as { email_hash: string }).email_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(failed)).not.toContain('min@point.test');
    expect(JSON.stringify(failed)).not.toContain('11112222');

    await verify(t, 'nobody@point.test', '12345678');
    const unknown = (await rowsOf('login.failed', null)).at(-1);
    expect(unknown).toMatchObject({ entity_id: null, after_data: { cause: 'unknown_email' } });
  });
});
