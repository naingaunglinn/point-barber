import { meResponseSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RateLimiter } from '../src/modules/platform/index.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';
import { latestCode, requestCode, sessionCookieOf, verify } from './helpers/sign-in.js';

// add-foundation-auth-access tasks 5.7, 5.9 and 4.14 — access spec "GET /v1/me returns everything the
// app needs to start" and "A user sets their own interface language on their account"; the session
// and CSRF scenarios of group 4 repeated on the real endpoints (API-AUTH-05 · P1.ME.01 / 02 ·
// P1-RULE-06 · D-PLT-03 · design D13).
const mmt = (local: string) => new Date(`${local}+06:30`);
const { B1, B2, B3 } = FIXTURE_IDS.branches;
const U = FIXTURE_IDS.users;
const ME = '/api/v1/me';
let t: SeededApp;

beforeAll(async () => {
  t = await startSeededApp({ now: mmt('2026-10-05T10:42:00') });
});
afterAll(async () => {
  await t.close();
});

const me = (cookie: string) => t.http.get(ME).set('Cookie', cookie);

describe('add-foundation-auth-access · access · GET /v1/me returns everything the app needs to start', () => {
  it('Scenario: A branch manager', async () => {
    const hnin = await t.signIn('E002');
    const res = await me(hnin.cookie);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(meResponseSchema.parse(res.body)).toBeDefined();
    expect(res.body.grants).toStrictEqual(
      [
        'branch.view',
        'employee.rating_update',
        'employee.view',
        'role.assign',
        'settings.update',
        'settings.view',
      ].map((code) => ({ code, scope_type: 2, branch_ids: [B3] })),
    );
    expect(res.body.branches_in_scope).toMatchObject([{ code: 'B3', name_en: 'Point 3.0' }]);
    expect(res.body.assigned_branch_ids).toStrictEqual([B3]);
    expect(res.body.effective).toStrictEqual({ show_own_earnings: false });
  });

  it('Scenario: The company admin', async () => {
    const res = await me((await t.signIn('E001')).cookie);
    const part1 = (res.body.grants as { code: string }[]).filter(
      (g) => !g.code.startsWith('fixture.'),
    );
    expect(part1).toHaveLength(21);
    for (const grant of part1) expect(grant).toMatchObject({ scope_type: 1, branch_ids: [] });
    expect((res.body.branches_in_scope as { id: string }[]).map((b) => b.id)).toStrictEqual([
      B1,
      B2,
      B3,
    ]);
  });

  it('Scenario: A barber — signed in from his Android phone', async () => {
    t.app.get(RateLimiter).reset();
    await requestCode(t, 'aung@point.test');
    const res = await verify(t, 'aung@point.test', (await latestCode(t, 'aung@point.test')) ?? '');
    expect(res.status).toBe(200);
    const again = await me(`point_session=${sessionCookieOf(res) ?? ''}`);
    for (const body of [res.body, again.body]) {
      expect(body).toMatchObject({
        grants: [],
        user: { email: 'aung@point.test' },
        employee: { name_en: 'Ko Aung' },
        session: { device_label: 'Android · Chrome' },
      });
      expect(body.branches_in_scope).toMatchObject([{ code: 'B3' }]);
    }
  });

  it('Scenario: An invited employee without a role, after her first sign-in', async () => {
    t.app.get(RateLimiter).reset();
    await requestCode(t, 'thida@point.test');
    const res = await verify(
      t,
      'thida@point.test',
      (await latestCode(t, 'thida@point.test')) ?? '',
    );
    expect(res.body).toMatchObject({ user: { status: 1 }, grants: [] });
    expect(res.body.branches_in_scope).toMatchObject([{ code: 'B3' }]);
  });

  it('Scenario: Settings and system blocks before the settings store exists', async () => {
    const res = await me((await t.signIn('E005')).cookie);
    expect(res.body.settings).toStrictEqual({
      'booking.slot_interval_minutes': 15,
      'booking.advance_window_days': 14,
      'sales.tax_enabled': false,
      'sales.service_charge_enabled': false,
      'closing.cash_difference_tolerance_amount': 0,
      'home_service.transport_fee_amount': 0,
      'system.default_language': 1,
      'system.upload_max_mb': 10,
      'receipt.printer_width_mm': 58,
      'receipt.auto_print': false,
    });
    expect(res.body.system).toStrictEqual({
      maintenance: false,
      server_time: '2026-10-05T10:42:00+06:30',
      default_language: 1,
    });
    expect(res.body.today_branch_id).toBeNull();
  });

  it("Scenario: Own-earnings flag follows the employee's override", async () => {
    const aung = await t.signIn('E004');
    const min = await t.signIn('E005');
    expect((await me(aung.cookie)).body.effective).toStrictEqual({ show_own_earnings: false });
    await t.prisma.employees.update({
      where: { id: FIXTURE_IDS.employees.E004 },
      data: { show_own_earnings: true },
    });
    expect((await me(aung.cookie)).body.effective).toStrictEqual({ show_own_earnings: true });
    expect((await me(min.cookie)).body.effective).toStrictEqual({ show_own_earnings: false });
  });

  it('Scenario: Reading is not audited', async () => {
    const res = await me((await t.signIn('E004')).cookie);
    const requestId = res.headers['x-request-id'] as string;
    expect(await t.prisma.audit_events.count({ where: { request_id: requestId } })).toBe(0);
  });
});

describe('add-foundation-auth-access · access · A user sets their own interface language on their account', () => {
  it('Scenarios: follows the user to another device · back to the system default · nothing audited', async () => {
    const phone = await t.signIn('E004');
    const laptop = await t.signIn('E004');
    const minBefore = (await t.prisma.users.findUniqueOrThrow({ where: { id: U.E005 } }))
      .ui_language;
    const res = await t.http.patch(ME).set('Cookie', phone.cookie).send({ ui_language: 2 });
    expect(res.status).toBe(200);
    expect(res.body.user.ui_language).toBe(2);
    expect((await me(laptop.cookie)).body.user.ui_language).toBe(2);
    expect(
      await t.prisma.audit_events.count({
        where: { request_id: res.headers['x-request-id'] as string },
      }),
    ).toBe(0);
    expect((await t.prisma.users.findUniqueOrThrow({ where: { id: U.E005 } })).ui_language).toBe(
      minBefore,
    );

    const back = await t.http.patch(ME).set('Cookie', phone.cookie).send({ ui_language: null });
    expect(back.body.user.ui_language).toBeNull();
    expect(back.body.system.default_language).toBe(1);
    expect(
      (await t.prisma.users.findUniqueOrThrow({ where: { id: U.E004 } })).ui_language,
    ).toBeNull();
  });

  it('Scenario: Unknown language value', async () => {
    const res = await t.http
      .patch(ME)
      .set('Cookie', (await t.signIn('E004')).cookie)
      .send({ ui_language: 3 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', errors: [{ field: 'ui_language' }] });
  });
});

describe('task 4.14 — the group 4 scenarios on the real endpoints', () => {
  it('GET /v1/me: no cookie, unknown token, a revoked session', async () => {
    expect((await t.http.get(ME)).body).toMatchObject({ code: 'unauthenticated' });
    expect(
      (await me('point_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).body,
    ).toMatchObject({ code: 'unauthenticated' });
    const min = await t.signIn('E005');
    await t.prisma.user_sessions.update({
      where: { id: min.sessionId },
      data: { revoked_at: mmt('2026-10-05T10:00:00'), revoke_reason: 3 },
    });
    expect((await me(min.cookie)).body).toMatchObject({ code: 'session_revoked', reason: 3 });
  });

  it('GET /v1/me re-issues the cookie at 30 days', async () => {
    t.clock?.set(mmt('2026-09-05T10:00:00'));
    const aung = await t.signIn('E004');
    t.clock?.set(mmt('2026-10-05T10:00:00'));
    const res = await me(aung.cookie);
    expect(res.headers['set-cookie']).toStrictEqual([
      `${aung.cookie}; Max-Age=34560000; Path=/; HttpOnly; Secure; SameSite=Lax`,
    ]);
    t.clock?.set(mmt('2026-10-05T10:42:00'));
  });

  it('PATCH /v1/me: the CSRF scenarios', async () => {
    const aung = await t.signIn('E004');
    const patch = () => t.raw.patch(ME).set('Cookie', aung.cookie);
    // Each request is built when it is sent: supertest closes its server after each one.
    const refused = [
      () => patch().set('Origin', 'https://app.point.test'),
      () =>
        patch().set('X-Requested-With', 'XMLHttpRequest').set('Origin', 'https://app.point.test'),
      () => patch().set('X-Requested-With', 'point-app').set('Origin', 'https://point.test'),
      () => patch().set('X-Requested-With', 'point-app'),
    ];
    for (const request of refused) {
      const res = await request().send({ ui_language: 2 });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'csrf' });
    }
    expect(
      (await t.prisma.users.findUniqueOrThrow({ where: { id: U.E004 } })).ui_language,
    ).toBeNull();
    const ok = await patch()
      .set('X-Requested-With', 'point-app')
      .set('Referer', 'https://app.point.test/')
      .send({ ui_language: 2 });
    expect(ok.status).toBe(200);
    expect((await t.prisma.users.findUniqueOrThrow({ where: { id: U.E004 } })).ui_language).toBe(2);
    expect((await t.raw.get(ME).set('Cookie', aung.cookie)).status).toBe(200);
  });
});
