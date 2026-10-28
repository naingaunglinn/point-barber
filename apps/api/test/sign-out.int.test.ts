import { createHash } from 'node:crypto';

import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DomainEvents } from '../src/common/events/domain-events.js';
import { BackgroundTasks } from '../src/common/http/background-tasks.js';
import { AuthCleanup } from '../src/modules/auth/jobs/auth-cleanup.js';
import { RateLimiter } from '../src/modules/platform/index.js';
import { cookieOf } from './helpers/people.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';
import { latestCode, requestCode, sessionCookieOf, verify } from './helpers/sign-in.js';

// add-foundation-auth-access tasks 5.10, 5.11, 5.16–5.18 — auth spec "Sign-out revokes the current
// session only", "Signing in again in the same browser revokes the session that browser held"; audit
// spec "Sign-out is an employee-targeted action" and "Codes, tokens and their hashes never reach the
// audit log, the application log or a stored job"; the `auth.cleanup` job and the in-process events
// (P1.AUTH.05 · P1-RULE-10 / 15 · CG-SEC-06 · ADR-002 · design D6 · D9 · D12 · D19).
const mmt = (local: string) => new Date(`${local}+06:30`);
const U = FIXTURE_IDS.users;
const ME = '/api/v1/me';
const LOGOUT = '/api/v1/auth/logout';
let t: SeededApp;
const events: { name: string; payload: Record<string, unknown> }[] = [];

beforeAll(async () => {
  t = await startSeededApp({ now: mmt('2026-10-05T09:00:00') });
  const bus = t.app.get(DomainEvents);
  for (const name of ['auth.session_created', 'auth.session_revoked']) {
    bus.on(name, (event) => {
      events.push({ name: event.name, payload: { ...event.payload } });
    });
  }
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.app.get(RateLimiter).reset();
});

const at = (local: string) => t.clock?.set(mmt(local));
const session = (id: string) => t.prisma.user_sessions.findUniqueOrThrow({ where: { id } });
async function signInWithCode(email: string, local: string, cookie?: string) {
  at(local);
  await requestCode(t, email);
  const code = (await latestCode(t, email)) ?? '';
  const res = await verify(t, email, code, cookie === undefined ? {} : { cookie });
  const token = sessionCookieOf(res);
  const row =
    token === undefined
      ? undefined
      : await t.prisma.user_sessions.findFirstOrThrow({
          where: { token_hash: createHash('sha256').update(token).digest('hex') },
        });
  return {
    res,
    code,
    token,
    cookie: token === undefined ? undefined : cookieOf(token),
    id: row?.id,
  };
}

describe('add-foundation-auth-access · auth · Sign-out revokes the current session only', () => {
  it('Scenarios: phone signs out, the laptop stays · the old cookie no longer works · audited with the primary branch', async () => {
    const phone = await t.signIn('E004');
    const laptop = await t.signIn('E004');
    at('2026-10-05T18:00:00');
    const res = await t.http
      .post(LOGOUT)
      .set('Cookie', phone.cookie)
      .set('X-Request-Id', '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70');
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']).toStrictEqual([
      'point_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
    ]);
    expect(await session(phone.sessionId)).toMatchObject({
      revoked_at: mmt('2026-10-05T18:00:00'),
      revoke_reason: 1,
      revoked_by_user_id: U.E004,
    });
    expect((await t.http.get(ME).set('Cookie', laptop.cookie)).status).toBe(200);

    at('2026-10-05T18:00:05');
    const old = await t.http.get(ME).set('Cookie', phone.cookie);
    expect(old.status).toBe(401);
    expect(old.body).toMatchObject({ code: 'session_revoked', reason: 1 });

    expect(
      await t.prisma.audit_events.findMany({
        where: { request_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70' },
      }),
    ).toMatchObject([
      {
        source: 1,
        action: 'session.revoked',
        entity_type: 'user_sessions',
        entity_id: phone.sessionId,
        actor_user_id: U.E004,
        actor_session_id: phone.sessionId,
        branch_id: FIXTURE_IDS.branches.B3,
        occurred_at: mmt('2026-10-05T18:00:00'),
      },
    ]);
  });

  it('Scenario: Sign-out without a session', async () => {
    const res = await t.http.post(LOGOUT);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'unauthenticated' });
  });
});

describe('add-foundation-auth-access · auth · Signing in again in the same browser revokes the session that browser held', () => {
  it('Scenarios: the same person · the revocation is audited with the request id of login.success', async () => {
    const s1 = await signInWithCode('aung@point.test', '2026-10-05T09:02:00');
    const s2 = await signInWithCode('aung@point.test', '2026-10-05T09:30:00', s1.cookie);
    expect(s2.res.status).toBe(200);
    expect(s2.token).not.toBe(s1.token);
    expect(await session(s1.id ?? '')).toMatchObject({
      revoked_at: mmt('2026-10-05T09:30:00'),
      revoke_reason: 1,
    });
    const old = await t.http.get(ME).set('Cookie', s1.cookie ?? '');
    expect(old.body).toMatchObject({ code: 'session_revoked', reason: 1 });

    const requestId = s2.res.headers['x-request-id'] as string;
    const rows = await t.prisma.audit_events.findMany({ where: { request_id: requestId } });
    expect(rows.map((row) => row.action).sort()).toStrictEqual([
      'login.success',
      'session.revoked',
    ]);
    expect(rows.find((row) => row.action === 'session.revoked')).toMatchObject({
      entity_type: 'user_sessions',
      entity_id: s1.id,
      after_data: { revoke_reason: 1 },
      branch_id: FIXTURE_IDS.branches.B3,
    });
  });

  it('Scenario: Another person signs in on a shared phone', async () => {
    const phone = await signInWithCode('aung@point.test', '2026-10-05T09:35:00');
    const laptop = await t.signIn('E004');
    const min = await signInWithCode('min@point.test', '2026-10-05T09:40:00', phone.cookie);
    expect(min.res.status).toBe(200);
    expect(await session(phone.id ?? '')).toMatchObject({
      revoked_at: mmt('2026-10-05T09:40:00'),
      revoke_reason: 1,
    });
    expect((await t.http.get(ME).set('Cookie', laptop.cookie)).status).toBe(200);
  });

  it('Scenario: A failed sign-in revokes nothing', async () => {
    const s1 = await t.signIn('E004');
    at('2026-10-05T09:45:00');
    await requestCode(t, 'aung@point.test');
    const res = await verify(t, 'aung@point.test', '11112222', { cookie: s1.cookie });
    expect(res.body).toMatchObject({ code: 'otp_invalid' });
    expect(await session(s1.sessionId)).toMatchObject({ revoked_at: null });
    expect((await t.http.get(ME).set('Cookie', s1.cookie)).status).toBe(200);
  });

  it('Scenario: An already revoked cookie is ignored', async () => {
    const s1 = await t.signIn('E004');
    at('2026-10-05T18:00:00');
    await t.http.post(LOGOUT).set('Cookie', s1.cookie);
    const again = await signInWithCode('aung@point.test', '2026-10-05T18:05:00', s1.cookie);
    expect(again.res.status).toBe(200);
    expect(await session(s1.sessionId)).toMatchObject({ revoked_at: mmt('2026-10-05T18:00:00') });
    expect(
      await t.prisma.audit_events.count({
        where: { action: 'session.revoked', entity_id: s1.sessionId },
      }),
    ).toBe(1);
  });
});

describe('add-foundation-auth-access · audit · Codes, tokens and their hashes never reach the audit log, the application log or a stored job', () => {
  it('Scenario: A complete sign-in leaves no secret behind', async () => {
    const since = mmt('2026-10-05T20:00:00');
    const firstLog = t.logs.length;
    const s = await signInWithCode('aung@point.test', '2026-10-05T20:00:00');
    expect(s.res.status).toBe(200);
    const secrets = [
      s.code,
      s.token ?? '',
      createHash('sha256')
        .update(s.token ?? '')
        .digest('hex'),
    ];
    const audit = JSON.stringify(
      await t.prisma.audit_events.findMany({ where: { occurred_at: { gte: since } } }),
    );
    const logs = JSON.stringify(t.logs.slice(firstLog));
    const jobs = JSON.stringify(
      await t.prisma.$queryRaw`SELECT data FROM pgboss.job WHERE name = 'email.send'`,
    );
    for (const secret of secrets) {
      expect(secret.length).toBeGreaterThan(0);
      expect(audit).not.toContain(secret);
      expect(logs).not.toContain(secret);
      expect(jobs).not.toContain(secret);
    }
  });

  it('Scenario: A failed attempt does not record the code that was tried', async () => {
    const firstLog = t.logs.length;
    const res = await verify(t, 'min@point.test', '11112222');
    const rows = await t.prisma.audit_events.findMany({
      where: { request_id: res.headers['x-request-id'] as string },
    });
    expect(rows.map((row) => row.action)).toStrictEqual(['login.failed']);
    expect(JSON.stringify(rows)).not.toContain('11112222');
    expect(JSON.stringify(t.logs.slice(firstLog))).not.toContain('11112222');
  });
});

describe('auth.cleanup (task 5.16 · ADR-002)', () => {
  it('deletes a code that expired a second ago and keeps one that expires in a second', async () => {
    const now = mmt('2026-10-06T08:00:00');
    at('2026-10-06T08:00:00');
    const row = (id: string, created: number, expires: number) => ({
      id,
      user_id: U.E004,
      code_hash: 'x'.repeat(64),
      created_at: new Date(now.getTime() + created),
      expires_at: new Date(now.getTime() + expires),
    });
    const expired = '0199a3f2-0000-7000-8f02-000000000001';
    const live = '0199a3f2-0000-7000-8f02-000000000002';
    await t.prisma.login_otps.createMany({
      data: [row(expired, -301_000, -1_000), row(live, -299_000, 1_000)],
    });
    await t.app.get(AuthCleanup).run();
    expect(await t.prisma.login_otps.findUnique({ where: { id: expired } })).toBeNull();
    expect(await t.prisma.login_otps.findUnique({ where: { id: live } })).not.toBeNull();
  });
});

describe('in-process events (task 5.17 · ADR-001 rule 1)', () => {
  it('auth.session_created and auth.session_revoked arrive once each, after commit', async () => {
    events.length = 0;
    const s = await signInWithCode('htet@point.test', '2026-10-06T09:00:00');
    await t.app.get(BackgroundTasks).drain();
    expect(events).toMatchObject([
      {
        name: 'auth.session_created',
        payload: { user_id: U.E006, session_id: s.id, login_method: 2 },
      },
    ]);
    await t.http.post(LOGOUT).set('Cookie', s.cookie ?? '');
    await t.app.get(BackgroundTasks).drain();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      name: 'auth.session_revoked',
      payload: { user_id: U.E006, session_id: s.id, revoke_reason: 1 },
    });
    // A failed sign-in emits nothing.
    await verify(t, 'htet@point.test', '11112222');
    await t.app.get(BackgroundTasks).drain();
    expect(events).toHaveLength(2);
  });
});
