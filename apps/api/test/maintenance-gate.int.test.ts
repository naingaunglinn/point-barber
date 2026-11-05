import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BackgroundTasks } from '../src/common/http/background-tasks.js';
import { SettingsRepository } from '../src/modules/platform/repositories/settings.repository.js';
import { RateLimiter } from '../src/modules/platform/index.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';
import { requestCode } from './helpers/sign-in.js';

// add-settings-store tasks 4.3 and 4.5 — spec "While maintenance is on, only company-scope
// settings.update holders reach the staff API" (D-PLT-08 · API-AUTH-06 · P1-RULE-04 · AD-NAV-08 · design
// D9): the gate in the guard chain after the session checks and before the access guard; the public,
// sign-in and internal routes stay open; `/me.system.maintenance` for those who pass; one settings read
// per staff request while off. Maintenance is turned on and off through P1.SYS.03. 05/Oct/2026 evening.
const API = '/api/v1';
const STAFF = `${API}/_fixtures/staff-read`;
const mmt = (local: string) => new Date(`${local}+06:30`);
const CONTEXT = {
  until: '2026-10-05T22:00:00+06:30',
  message_mm: 'ဆာဗာ ပြင်နေပါတယ်',
  message_en: 'Server update',
};

let s: SeededApp;
const sessions = new Map<FixturePerson, { cookie: string; sessionId: string }>();

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T20:55:00'));
});
afterAll(() => s.close());

const at = (local: string) => s.clock?.set(mmt(local));
const session = async (who: FixturePerson) => {
  const known = sessions.get(who);
  if (known !== undefined) return known;
  const fresh = await s.signIn(who);
  sessions.set(who, fresh);
  return fresh;
};
const get = async (who: FixturePerson, path: string) =>
  s.http.get(`${API}${path}`).set('Cookie', (await session(who)).cookie);
const maintenance = async (body: object) => {
  const res = await s.http
    .put(`${API}/system/maintenance`)
    .set('Cookie', (await session('E001')).cookie)
    .send(body);
  await s.app.get(BackgroundTasks).drain();
  return res;
};

describe('while maintenance is off (task 4.3)', () => {
  it('a staff request reads settings exactly once (the gate) and /me says maintenance false', async () => {
    const reads = vi.spyOn(s.app.get(SettingsRepository), 'rowsOf');
    try {
      const res = await s.http.get(STAFF).set('Cookie', (await session('E004')).cookie);
      expect(res.status).toBe(200);
      expect(reads).toHaveBeenCalledTimes(1);
      expect(reads.mock.calls[0]?.[1]).toStrictEqual(['system.maintenance']);
    } finally {
      reads.mockRestore();
    }
    expect((await get('E004', '/me')).body.system.maintenance).toBe(false);
  });
});

describe('add-settings-store · settings · While maintenance is on, only company-scope settings.update holders reach the staff API', () => {
  beforeAll(async () => {
    at('2026-10-05T21:00:00');
    const res = await maintenance({ enabled: true, ...CONTEXT });
    expect(res.status).toBe(200);
    at('2026-10-05T21:05:00');
  });

  it('Scenario: A barber is held back', async () => {
    const res = await get('E004', '/me');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'maintenance', status: 503, context: CONTEXT });
  });

  it('Scenario: A branch manager is held back', async () => {
    const res = await get('E002', '/settings');
    expect([res.status, res.body.code]).toStrictEqual([503, 'maintenance']);
  });

  it('Scenario: The admin works on', async () => {
    const me = await get('E001', '/me');
    expect(me.status).toBe(200);
    expect(me.body.system.maintenance).toBe(true);
    const write = await s.http
      .put(`${API}/settings/receipt.auto_print`)
      .set('Cookie', (await session('E001')).cookie)
      .send({ value: true });
    expect([write.status, write.body.effective]).toStrictEqual([200, true]);
  });

  it('Scenario: Public and sign-in paths stay open', async () => {
    const status = await s.http.get(`${API}/system/status`);
    expect([status.status, status.body.maintenance]).toStrictEqual([200, true]);
    expect((await s.http.get(`${API}/health`)).status).toBe(200);
    s.app.get(RateLimiter).reset();
    expect((await requestCode(s, 'aung@point.test')).status).toBe(202);
  });

  it('Scenario: Session checks come first', async () => {
    const min = await s.signIn('E005');
    await s.prisma.user_sessions.update({
      where: { id: min.sessionId },
      data: { revoked_at: mmt('2026-10-05T21:01:00'), revoke_reason: 1 },
    });
    const res = await s.http.get(`${API}/me`).set('Cookie', min.cookie);
    expect([res.status, res.body.code]).toStrictEqual([401, 'session_revoked']);
    // And no session at all is 401, not 503.
    expect((await s.http.get(STAFF)).status).toBe(401);
  });

  it('Scenario: Sign-out during maintenance', async () => {
    const aung = await session('E004');
    const res = await s.http.post(`${API}/auth/logout`).set('Cookie', aung.cookie);
    expect([res.status, res.body.code]).toStrictEqual([503, 'maintenance']);
    const row = await s.prisma.user_sessions.findUniqueOrThrow({ where: { id: aung.sessionId } });
    expect(row.revoked_at).toBeNull();
  });

  it('an @Internal() route never reaches the gate', async () => {
    const res = await s.http
      .post(`${API}/_fixtures/internal`)
      .set('X-Internal-Key', 'o'.repeat(16));
    expect([res.status, res.body]).toStrictEqual([200, { ok: true }]);
  });

  it("a held-back request runs no handler: the manager's write is not stored", async () => {
    const res = await s.http
      .put(`${API}/settings/home_service.transport_fee_amount`)
      .set('Cookie', (await session('E002')).cookie)
      .send({ value: 3000, branch_id: FIXTURE_IDS.branches.B3 });
    expect(res.status).toBe(503);
    expect(
      await s.prisma.settings.count({ where: { key: 'home_service.transport_fee_amount' } }),
    ).toBe(0);
  });

  it('Scenario: Maintenance ends', async () => {
    at('2026-10-05T22:15:00');
    const off = await maintenance({ enabled: false });
    expect([off.status, off.body.maintenance]).toStrictEqual([200, false]);
    at('2026-10-05T22:16:00');
    const res = await get('E004', '/me');
    expect(res.status).toBe(200);
    expect(res.body.system.maintenance).toBe(false);
  });
});

// Review of PR #45: the restore runbook writes `system.maintenance` by SQL while the API is stopped
// (P8.BAK.03). A value P1.SYS.03 would refuse — here JSON null — is ignored: maintenance reads as off
// on the staff API and on the public status, and the error log names the key, not the value.
describe('a malformed stored maintenance value', () => {
  it('reads as off on the staff API and the public status; each read logs the key and the issue', async () => {
    at('2026-10-05T22:20:00');
    await s.prisma.$executeRaw`
      UPDATE settings SET value = 'null'::jsonb WHERE key = 'system.maintenance' AND branch_id IS NULL`;
    const logged = s.logs.length;
    const staff = await get('E004', '/me');
    expect([staff.status, staff.body.system.maintenance]).toStrictEqual([200, false]);
    const status = await s.http.get(`${API}/system/status`);
    expect([status.status, status.body.maintenance]).toStrictEqual([200, false]);
    const errors = s.logs
      .slice(logged)
      .filter((line) => line.key === 'system.maintenance' && line.issues !== undefined);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors[0]).toMatchObject({
      level: 50,
      key: 'system.maintenance',
      issues: [{ path: [], code: 'invalid_type' }],
    });
    expect(Object.keys(errors[0] ?? {})).not.toContain('value');
  });

  it('the settings list (P1.SET.01) ignores the row as the reader does: the default, from no row', async () => {
    const list = await get('E001', '/settings?module=system');
    expect(list.status).toBe(200);
    const item = (list.body.items as { key: string }[]).find(
      ({ key }) => key === 'system.maintenance',
    );
    expect(item).toMatchObject({
      company_value: null,
      effective: { enabled: false },
      source: 'default',
      updated_at: null,
    });
  });
});
