import { LoginMethod, RevokeReason } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { SessionService, sessionTokenHash } from '../src/modules/auth/index.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-foundation-auth-access task 4.1 — SessionService (API-AUTH-01 · ADR-005 · D-AUTH-06 ·
// P1-RULE-15 · design D6): what `create` writes, the one-query look-up, the revocation pair and the
// replacement of the session a browser held when it signs in again.
const NOW = new Date('2026-10-05T02:32:00.000Z'); // Monday 05/Oct/2026 9:02 AM MMT
const AUNG = FIXTURE_IDS.users.E004;
let t: SeededApp;
let sessions: SessionService;
let runner: TransactionRunner;

beforeAll(async () => {
  t = await startSeededApp({ now: NOW });
  sessions = t.app.get(SessionService);
  runner = t.app.get(TransactionRunner);
});
afterAll(async () => {
  await t.close();
});

const create = (replacesToken?: string) =>
  runner.run((tx) =>
    sessions.create(
      tx,
      AUNG,
      LoginMethod.EMAIL_OTP,
      {
        device_label: 'Android · Chrome',
        user_agent: 'Mozilla/5.0 (Linux; Android 14)',
        ip: '203.0.113.7',
      },
      replacesToken === undefined ? {} : { replacesToken },
    ),
  );
const row = (id: string) => t.prisma.user_sessions.findUniqueOrThrow({ where: { id } });

describe('SessionService (task 4.1)', () => {
  it('creates a session whose token is stored only as its SHA-256 hash', async () => {
    const { token, sessionId } = await create();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const session = await row(sessionId);
    expect(session).toMatchObject({
      user_id: AUNG,
      token_hash: sessionTokenHash(token),
      login_method: LoginMethod.EMAIL_OTP,
      device_label: 'Android · Chrome',
      user_agent: 'Mozilla/5.0 (Linux; Android 14)',
      ip_address: '203.0.113.7',
      created_at: NOW,
      last_seen_at: NOW,
      revoked_at: null,
    });
    expect(Object.values(session)).not.toContain(token);
  });

  it('resolves a token to the session, the user and the employee', async () => {
    const { token, sessionId } = await create();
    expect(await sessions.resolve(token)).toMatchObject({
      session: { id: sessionId, user_id: AUNG, revoked_at: null },
      userStatus: 1,
      employee: { id: FIXTURE_IDS.employees.E004, status: 1 },
    });
    expect(await sessions.resolve('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBeNull();
  });

  it('revokes with the pair revoked_at / revoke_reason, once', async () => {
    const { sessionId } = await create();
    expect(
      await runner.run((tx) =>
        sessions.revoke(tx, sessionId, RevokeReason.ADMIN_REVOKE_ALL, FIXTURE_IDS.users.E001),
      ),
    ).toBe(true);
    expect(
      await runner.run((tx) => sessions.revoke(tx, sessionId, RevokeReason.LOGOUT, AUNG)),
    ).toBe(false);
    expect(await row(sessionId)).toMatchObject({
      revoked_at: NOW,
      revoke_reason: RevokeReason.ADMIN_REVOKE_ALL,
      revoked_by_user_id: FIXTURE_IDS.users.E001,
    });
  });

  it('revokes the still-valid session of replacesToken with reason 1 and audits it', async () => {
    const s1 = await create();
    const s2 = await create(s1.token);
    expect(s2.sessionId).not.toBe(s1.sessionId);
    expect(await row(s1.sessionId)).toMatchObject({
      revoked_at: NOW,
      revoke_reason: RevokeReason.LOGOUT,
      revoked_by_user_id: AUNG,
    });
    expect(await row(s2.sessionId)).toMatchObject({ revoked_at: null });
    expect(
      await t.prisma.audit_events.findMany({
        where: { action: 'session.revoked', entity_id: s1.sessionId },
      }),
    ).toMatchObject([
      {
        entity_type: 'user_sessions',
        after_data: { revoke_reason: 1 },
        branch_id: FIXTURE_IDS.branches.B3,
        actor_user_id: AUNG,
        actor_session_id: s2.sessionId,
      },
    ]);
  });

  it('ignores an unknown or an already revoked replacesToken', async () => {
    const s1 = await create();
    await runner.run((tx) => sessions.revoke(tx, s1.sessionId, RevokeReason.LOGOUT, AUNG));
    const before = await row(s1.sessionId);
    await create(s1.token);
    await create('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(await row(s1.sessionId)).toStrictEqual(before);
    expect(
      await t.prisma.audit_events.count({
        where: { action: 'session.revoked', entity_id: s1.sessionId },
      }),
    ).toBe(1);
  });

  it('leaves the other sessions of the user alone', async () => {
    const laptop = await create();
    const phone = await create();
    await create(phone.token);
    expect(await row(laptop.sessionId)).toMatchObject({ revoked_at: null });
    expect(await row(phone.sessionId)).toMatchObject({ revoke_reason: RevokeReason.LOGOUT });
  });
});
