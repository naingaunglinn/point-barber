import { ErrorCode, RevokeReason } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ProblemException } from '../src/common/http/problem.exception.js';
import { MaintenanceGate } from '../src/modules/platform/index.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-foundation-auth-access tasks 4.2–4.3 — auth spec "Every staff request re-checks the session, the
// user and the employee" and "The session lives in the cookie point_session and never expires on its
// own" (P1-RULE-04 · API-AUTH-01 · ADR-005 · design D2 · D6). The staff endpoint is the fixture
// `GET /api/v1/_fixtures/staff-read` (`@Staff()`); `GET /api/v1/me` arrives with group 6.
const STAFF = '/api/v1/_fixtures/staff-read';
const mmt = (local: string) => new Date(`${local}+06:30`);
let t: SeededApp;

beforeAll(async () => {
  t = await startSeededApp({ now: mmt('2026-10-05T10:00:00') });
});
afterAll(async () => {
  await t.close();
});

const at = (local: string) => t.clock?.set(mmt(local));
const lastSeen = async (sessionId: string) =>
  (await t.prisma.user_sessions.findUniqueOrThrow({ where: { id: sessionId } })).last_seen_at;

describe('add-foundation-auth-access · auth · Every staff request re-checks the session, the user and the employee', () => {
  it('Scenario: No cookie', async () => {
    const res = await t.http.get(STAFF);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'unauthenticated' });
  });

  it('Scenario: Unknown token', async () => {
    const res = await t.http
      .get(STAFF)
      .set('Cookie', 'point_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'unauthenticated' });
  });

  it.each([1, 2, 3, 4])('Scenario: Session revoked with reason %i', async (reason) => {
    const min = await t.signIn('E005');
    await t.prisma.user_sessions.update({
      where: { id: min.sessionId },
      data: { revoked_at: mmt('2026-10-05T09:00:00'), revoke_reason: reason },
    });
    const res = await t.http.get(STAFF).set('Cookie', min.cookie);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'session_revoked', reason });
  });

  it('Scenario: Status is checked even when the session row was left active', async () => {
    const naing = await t.signIn('E009'); // users.status 0, employees.status 0
    const res = await t.http.get(STAFF).set('Cookie', naing.cookie);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      code: 'session_revoked',
      reason: RevokeReason.ACCOUNT_INACTIVE,
    });
  });

  it('an invited user with an unrevoked session gets reason 4 too', async () => {
    const thida = await t.signIn('E008'); // users.status 2 INVITED
    const res = await t.http.get(STAFF).set('Cookie', thida.cookie);
    expect(res.body).toMatchObject({
      code: 'session_revoked',
      reason: RevokeReason.ACCOUNT_INACTIVE,
    });
  });

  it('Scenario: Employee deactivated while signed in', async () => {
    const min = await t.signIn('E005');
    expect((await t.http.get(STAFF).set('Cookie', min.cookie)).status).toBe(200);
    await t.prisma.employees.update({
      where: { id: FIXTURE_IDS.employees.E005 },
      data: { status: 0 },
    });
    try {
      const res = await t.http.get(STAFF).set('Cookie', min.cookie);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'session_revoked', reason: 4 });
    } finally {
      await t.prisma.employees.update({
        where: { id: FIXTURE_IDS.employees.E005 },
        data: { status: 1 },
      });
    }
  });

  it('Scenario: The session is checked before the permission', async () => {
    const min = await t.signIn('E005');
    await t.prisma.user_sessions.update({
      where: { id: min.sessionId },
      data: { revoked_at: mmt('2026-10-05T09:00:00'), revoke_reason: 3 },
    });
    // Ko Min holds no employee code: with a valid session this list answers 403.
    const res = await t.http.get('/api/v1/_fixtures/branch-notes').set('Cookie', min.cookie);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'session_revoked', reason: 3 });
  });

  it('Scenario: Last-seen is not written at 4 minutes 59 seconds, and is at 5 minutes', async () => {
    at('2026-10-05T10:00:00');
    const aung = await t.signIn('E004');
    at('2026-10-05T10:04:59');
    expect((await t.http.get(STAFF).set('Cookie', aung.cookie)).status).toBe(200);
    expect(await lastSeen(aung.sessionId)).toStrictEqual(mmt('2026-10-05T10:00:00'));
    at('2026-10-05T10:05:00');
    expect((await t.http.get(STAFF).set('Cookie', aung.cookie)).status).toBe(200);
    expect(await lastSeen(aung.sessionId)).toStrictEqual(mmt('2026-10-05T10:05:00'));
  });
});

describe('add-foundation-auth-access · auth · The session lives in the cookie point_session and never expires on its own', () => {
  it('Scenarios: No idle timeout · re-issue at exactly 30 days, once per period, and in the next period', async () => {
    at('2026-09-05T10:00:00');
    const aung = await t.signIn('E004');
    const value = aung.cookie.slice('point_session='.length);

    // No idle timeout, and no re-issue at 29 days.
    at('2026-10-04T10:00:00');
    let res = await t.http.get(STAFF).set('Cookie', aung.cookie);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();

    // Exactly 30 days: the same token with a fresh Max-Age.
    at('2026-10-05T10:00:00');
    res = await t.http.get(STAFF).set('Cookie', aung.cookie);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toStrictEqual([
      `point_session=${value}; Max-Age=34560000; Path=/; HttpOnly; Secure; SameSite=Lax`,
    ]);

    // Only once per period.
    at('2026-10-05T10:01:00');
    res = await t.http.get(STAFF).set('Cookie', aung.cookie);
    expect(res.headers['set-cookie']).toBeUndefined();

    // The next period.
    at('2026-11-04T10:00:00');
    res = await t.http.get(STAFF).set('Cookie', aung.cookie);
    expect(res.headers['set-cookie']).toStrictEqual([
      `point_session=${value}; Max-Age=34560000; Path=/; HttpOnly; Secure; SameSite=Lax`,
    ]);
  });
});

describe('the maintenance step of P1-RULE-04 (design D2)', () => {
  it('runs after the session checks and can refuse the request', async () => {
    const closed = await startSeededApp({
      overrides: [
        {
          provide: MaintenanceGate,
          useValue: {
            assertOpen: () =>
              Promise.reject(new ProblemException(ErrorCode.FORBIDDEN, 403, { detail: 'closed' })),
            isOn: () => Promise.resolve(true),
          },
        },
      ],
    });
    try {
      const aung = await closed.signIn('E004');
      expect((await closed.http.get(STAFF).set('Cookie', aung.cookie)).status).toBe(403);
      // Without a session the session check answers first.
      expect((await closed.http.get(STAFF)).status).toBe(401);
      // A public route never reaches the gate.
      expect((await closed.http.get('/api/v1/health')).status).toBe(200);
    } finally {
      await closed.close();
    }
  });
});
