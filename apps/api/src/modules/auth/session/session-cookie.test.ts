import { describe, expect, it } from 'vitest';

import { readCookie, sessionCookie } from './session-cookie.js';
import { newSessionToken, sessionTokenHash } from './session-token.js';
import { reissuePeriod, sessionState } from './session.service.js';

// add-foundation-auth-access task 4.1 — "The session lives in the cookie point_session and never
// expires on its own" (API-AUTH-01 · ADR-005 · design D6): the token, its hash and the cookie.

describe('session token and cookie (task 4.1)', () => {
  it('is 43 characters of base64url, new every time', () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(token);
  });

  it('stores only the 64-character SHA-256 hex digest', () => {
    expect(sessionTokenHash('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(sessionTokenHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('writes exactly HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=34560000 and no Domain', () => {
    const header = sessionCookie('tok', true);
    expect(header).toBe(
      'point_session=tok; Max-Age=34560000; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
    expect(header).not.toMatch(/Domain=|Expires=/i);
  });

  it('leaves Secure out only when the switch is off (development and test)', () => {
    expect(sessionCookie('tok', false)).toBe(
      'point_session=tok; Max-Age=34560000; Path=/; HttpOnly; SameSite=Lax',
    );
  });

  it('reads one cookie of a Cookie header', () => {
    expect(readCookie('a=1; point_session=tok; b=2', 'point_session')).toBe('tok');
    expect(readCookie('point_session_x=1', 'point_session')).toBeUndefined();
    expect(readCookie('point_session=', 'point_session')).toBeUndefined();
    expect(readCookie(undefined, 'point_session')).toBeUndefined();
    expect(readCookie('flag; point_session=tok', 'point_session')).toBe('tok');
  });

  it('reads no session from two point_session values — one was planted (PR #21 review item 6)', () => {
    expect(
      readCookie('point_session=attacker; point_session=victim', 'point_session'),
    ).toBeUndefined();
    expect(readCookie('point_session=tok; point_session=tok', 'point_session')).toBeUndefined();
  });
});

describe('the session verdict of P1-RULE-04 (task 4.2)', () => {
  const session = {
    id: 's',
    user_id: 'u',
    created_at: new Date('2026-09-05T03:30:00Z'),
    last_seen_at: new Date('2026-09-05T03:30:00Z'),
    revoked_at: null,
    revoke_reason: null,
  };
  const active = { session, userStatus: 1, employee: { id: 'e', status: 1 } };

  it('unknown token', () => {
    expect(sessionState(null)).toStrictEqual({ kind: 'unknown' });
  });

  it.each([1, 2, 3, 4])('revoked with reason %i', (reason) => {
    expect(
      sessionState({
        ...active,
        session: { ...session, revoked_at: new Date(), revoke_reason: reason },
      }),
    ).toStrictEqual({ kind: 'revoked', reason });
  });

  it.each([
    ['disabled user', { userStatus: 0 }],
    ['invited user', { userStatus: 2 }],
    ['inactive employee', { employee: { id: 'e', status: 0 } }],
    ['no employee', { employee: null }],
  ])('%s with an unrevoked session → reason 4', (_name, change) => {
    expect(sessionState({ ...active, ...change })).toStrictEqual({ kind: 'revoked', reason: 4 });
  });

  it('valid', () => {
    expect(sessionState(active)).toStrictEqual({ kind: 'valid', session, employeeId: 'e' });
  });
});

describe('re-issue periods (task 4.3 · design D6)', () => {
  const created = new Date('2026-09-05T03:30:00Z'); // 05/Sep/2026 10:00 AM MMT
  const at = (iso: string) => new Date(iso);

  it('counts whole 30-day periods from created_at', () => {
    expect(reissuePeriod(created, at('2026-10-04T03:30:00Z'))).toBe(0); // 29 days
    expect(reissuePeriod(created, at('2026-10-05T03:29:59Z'))).toBe(0);
    expect(reissuePeriod(created, at('2026-10-05T03:30:00Z'))).toBe(1); // exactly 30 days
    expect(reissuePeriod(created, at('2026-11-04T03:30:00Z'))).toBe(2); // 60 days
  });
});
