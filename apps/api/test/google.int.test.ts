import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type SeededApp, startSeededApp } from './helpers/seeded.js';
import { OidcStub, type StubIdentity } from './support/oidc-stub.js';

// add-foundation-auth-access tasks 5.12–5.15 and 5.18 — auth spec "Google sign-in in a browser is a
// redirect flow that returns only to the staff app", "A Google account is tied to the user at the
// first Google sign-in" and the Google scenario of "Signing in again in the same browser …", against
// the stub issuer (P1.AUTH.03 / 04 · D-AUTH-08 · P1-RULE-02 / 15 · ADR-005 · design D7).
const mmt = (local: string) => new Date(`${local}+06:30`);
const U = FIXTURE_IDS.users;
const START = '/api/v1/auth/google/start';
const CALLBACK = '/api/v1/auth/google/callback';
const NOT_LINKED = '/login?error=google_not_linked';
let t: SeededApp;
let stub: OidcStub;

beforeAll(async () => {
  stub = new OidcStub('point-test-client');
  const issuer = await stub.start();
  t = await startSeededApp({ now: mmt('2026-10-05T09:50:00'), env: { GOOGLE_ISSUER: issuer } });
});
afterAll(async () => {
  await t.close();
  await stub.stop();
});

const cookiesOf = (res: { headers: Record<string, unknown> }) =>
  (res.headers['set-cookie'] as string[] | undefined) ?? [];

async function start(returnTo?: string) {
  const res = await t.http.get(
    returnTo === undefined ? START : `${START}?return_to=${encodeURIComponent(returnTo)}`,
  );
  const location = new URL(res.headers.location as string);
  return {
    res,
    location,
    state: location.searchParams.get('state') ?? '',
    nonce: location.searchParams.get('nonce') ?? '',
  };
}

/** The whole browser flow for a Google identity; options bend one step. */
async function googleSignIn(
  identity: Omit<StubIdentity, 'nonce'>,
  options: {
    returnTo?: string;
    cookieState?: string;
    sessionCookie?: string;
    nonce?: string;
  } = {},
) {
  const flow = await start(options.returnTo);
  const code = stub.issue({ ...identity, nonce: options.nonce ?? flow.nonce });
  const cookies = [`point_oauth_state=${options.cookieState ?? flow.state}`];
  if (options.sessionCookie !== undefined) cookies.push(options.sessionCookie);
  const res = await t.http
    .get(`${CALLBACK}?state=${flow.state}&code=${code}`)
    .set('Cookie', cookies.join('; '));
  const session = cookiesOf(res).find((cookie) => cookie.startsWith('point_session='));
  return { res, location: res.headers.location as string, session };
}

const aung = { sub: 'g-1001', email: 'aung@point.test', email_verified: true };
const user = (id: string) => t.prisma.users.findUniqueOrThrow({ where: { id } });

describe('add-foundation-auth-access · auth · Google sign-in in a browser is a redirect flow that returns only to the staff app', () => {
  it('Scenario: Start redirects to Google', async () => {
    const { res, location } = await start('/today');
    expect(res.status).toBe(302);
    expect(location.href.startsWith(`${stub.issuer}/authorize`)).toBe(true);
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('state')).toMatch(/.+/);
    expect(location.searchParams.get('scope')?.split(' ')).toEqual(
      expect.arrayContaining(['openid', 'email']),
    );
    const state = cookiesOf(res).find((cookie) => cookie.startsWith('point_oauth_state='));
    expect(state).toMatch(/HttpOnly/);
    expect(state).toMatch(/Secure/);
    expect(state).toMatch(/SameSite=Lax/);
    expect(state).toMatch(/Path=\/api\/v1\/auth\/google/);
    expect(state).toMatch(/Max-Age=600/);
  });

  it('Scenario: Callback signs in and returns to the requested page', async () => {
    const { res, location, session } = await googleSignIn(aung, { returnTo: '/today' });
    expect(res.status).toBe(302);
    expect(location).toBe('/today');
    expect(session).toMatch(/^point_session=[A-Za-z0-9_-]{43};/);
    expect(
      await t.prisma.user_sessions.count({ where: { user_id: U.E004, login_method: 1 } }),
    ).toBeGreaterThan(0);
    expect(
      await t.prisma.audit_events.findFirst({
        where: { action: 'login.success', entity_id: U.E004 },
        orderBy: { occurred_at: 'desc' },
      }),
    ).toMatchObject({ after_data: { method: 'google' } });
    // The state cookie is cleared.
    expect(cookiesOf(res)).toContainEqual(expect.stringMatching(/^point_oauth_state=; Max-Age=0/));
  });

  it('Scenarios: No return path · a foreign return address is ignored', async () => {
    expect((await googleSignIn(aung)).location).toBe('/');
    for (const returnTo of ['https://evil.test/x', '//evil.test/x', '/\\evil.test']) {
      expect((await googleSignIn(aung, { returnTo })).location).toBe('/');
    }
  });

  it('Scenario: State does not match', async () => {
    const sessions = await t.prisma.user_sessions.count();
    const { location, session, res } = await googleSignIn(aung, { cookieState: 'another-state' });
    expect(location).toBe(NOT_LINKED);
    expect(session).toBeUndefined();
    expect(await t.prisma.user_sessions.count()).toBe(sessions);
    expect(cookiesOf(res)).toContainEqual(expect.stringMatching(/^point_oauth_state=; Max-Age=0/));
  });

  it('an unverified e-mail is refused', async () => {
    const { location, session } = await googleSignIn({ ...aung, email_verified: false });
    expect(location).toBe(NOT_LINKED);
    expect(session).toBeUndefined();
  });
});

describe('add-foundation-auth-access · auth · A Google account is tied to the user at the first Google sign-in', () => {
  it('Scenarios: the first sign-in stored g-1001 · later sign-ins by the account id', async () => {
    expect((await user(U.E004)).google_subject).toBe('g-1001');
    const later = await googleSignIn({ ...aung, email: 'renamed@example.test' });
    expect(later.location).toBe('/');
    expect(later.session).toBeDefined();
  });

  it('Scenario: A different Google account with the same address is refused', async () => {
    const { location, session } = await googleSignIn({ ...aung, sub: 'g-2002' });
    expect(location).toBe(NOT_LINKED);
    expect(session).toBeUndefined();
    expect((await user(U.E004)).google_subject).toBe('g-1001');
  });

  it('Scenario: A Google account nobody registered', async () => {
    const users = JSON.stringify(await t.prisma.users.findMany({ orderBy: { id: 'asc' } }));
    const { location, res } = await googleSignIn({
      sub: 'g-9999',
      email: 'stranger@example.test',
      email_verified: true,
    });
    expect(location).toBe(NOT_LINKED);
    expect(JSON.stringify(await t.prisma.users.findMany({ orderBy: { id: 'asc' } }))).toBe(users);
    const rows = await t.prisma.audit_events.findMany({
      where: { request_id: res.headers['x-request-id'] as string },
    });
    expect(rows).toMatchObject([
      {
        action: 'login.failed',
        entity_id: null,
        after_data: { method: 'google', cause: 'no_match' },
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain('g-9999');
  });

  it('Scenario: Deactivated employee', async () => {
    const { location, session } = await googleSignIn({
      sub: 'g-3003',
      email: 'naing@point.test',
      email_verified: true,
    });
    expect(location).toBe(NOT_LINKED);
    expect(session).toBeUndefined();
  });

  it('an invited user is activated by the first Google sign-in', async () => {
    const { session } = await googleSignIn({
      sub: 'g-4004',
      email: 'thida@point.test',
      email_verified: true,
    });
    expect(session).toBeDefined();
    expect(await user(U.E008)).toMatchObject({
      status: 1,
      google_subject: 'g-4004',
      activated_at: mmt('2026-10-05T09:50:00'),
    });
  });
});

describe('add-foundation-auth-access · auth · Signing in again in the same browser … (Google)', () => {
  it('Scenario: Google sign-in follows the same rule', async () => {
    const s1 = await t.signIn('E004');
    const { session } = await googleSignIn(aung, { sessionCookie: s1.cookie });
    expect(session).toBeDefined();
    expect(
      await t.prisma.user_sessions.findUniqueOrThrow({ where: { id: s1.sessionId } }),
    ).toMatchObject({
      revoked_at: mmt('2026-10-05T09:50:00'),
      revoke_reason: 1,
    });
  });
});

// PR #21 review (20/Oct/2026) — items 1–4 of the security pass.
describe('Google sign-in: the review findings', () => {
  const failedRows = (requestId: string) =>
    t.prisma.audit_events.findMany({ where: { request_id: requestId, action: 'login.failed' } });

  it('item 1: `_` and `%` in the verified address are characters, not wildcards', async () => {
    for (const email of ['mi_@point.test', '%@point.test', 'h%@point.test']) {
      const { location, session, res } = await googleSignIn({
        sub: `g-wild-${email.length}`,
        email,
        email_verified: true,
      });
      expect(location).toBe(NOT_LINKED);
      expect(session).toBeUndefined();
      expect(await failedRows(res.headers['x-request-id'] as string)).toMatchObject([
        { entity_id: null, after_data: { cause: 'no_match' } },
      ]);
    }
    expect((await user(U.E005)).google_subject).toBeNull();
  });

  it('item 2: a Google sign-in neither resets nor reads the code-failure counter', async () => {
    const until = new Date('2026-10-05T03:04:00Z'); // 9:34 AM MMT
    await t.prisma.users.update({
      where: { id: U.E003 },
      data: { failed_login_count: 5, login_locked_until: until },
    });
    const { session } = await googleSignIn({
      sub: 'g-8008',
      email: 'zaw@point.test',
      email_verified: true,
    });
    expect(session).toBeDefined();
    expect(await user(U.E003)).toMatchObject({ failed_login_count: 5, login_locked_until: until });
  });

  it('item 3: two first sign-ins on one address at the same moment link one account only', async () => {
    const [first, second] = await Promise.all([
      googleSignIn({ sub: 'g-6006', email: 'htet@point.test', email_verified: true }),
      googleSignIn({ sub: 'g-7007', email: 'htet@point.test', email_verified: true }),
    ]);
    const linked = (await user(U.E006)).google_subject;
    expect(['g-6006', 'g-7007']).toContain(linked);
    const winner = linked === 'g-6006' ? first : second;
    const loser = linked === 'g-6006' ? second : first;
    expect(winner.session).toBeDefined();
    expect(loser.session).toBeUndefined();
    expect(loser.location).toBe(NOT_LINKED);
  });

  it.each(['signature', 'audience', 'issuer', 'expired'] as const)(
    'item 4: an ID token with a wrong %s is refused',
    async (tamper) => {
      const { location, session, res } = await googleSignIn({ ...aung, tamper });
      expect(location).toBe(NOT_LINKED);
      expect(session).toBeUndefined();
      expect(await failedRows(res.headers['x-request-id'] as string)).toMatchObject([
        { after_data: { cause: 'google_error' } },
      ]);
    },
  );

  it('item 4: an ID token with another nonce is refused', async () => {
    const { location, session } = await googleSignIn(aung, { nonce: 'another-nonce' });
    expect(location).toBe(NOT_LINKED);
    expect(session).toBeUndefined();
  });

  it('item 4: a state is used once — a replayed callback is refused', async () => {
    const flow = await start();
    const cookie = `point_oauth_state=${flow.state}`;
    const first = await t.http
      .get(`${CALLBACK}?state=${flow.state}&code=${stub.issue({ ...aung, nonce: flow.nonce })}`)
      .set('Cookie', cookie);
    expect(first.headers.location).toBe('/');
    const replay = await t.http
      .get(`${CALLBACK}?state=${flow.state}&code=${stub.issue({ ...aung, nonce: flow.nonce })}`)
      .set('Cookie', cookie);
    expect(replay.headers.location).toBe(NOT_LINKED);
    expect(cookiesOf(replay).some((value) => value.startsWith('point_session='))).toBe(false);
  });
});
