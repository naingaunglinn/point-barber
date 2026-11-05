import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DomainEvents, type DomainEvent } from '../src/common/events/domain-events.js';
import { BackgroundTasks } from '../src/common/http/background-tasks.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-settings-store task 4.1 — spec "Maintenance mode is switched by a company-scope settings.update
// holder" (D-PLT-08 · P1.SYS.03 · P1-RULE-10 · P1-RULE-13 · owner SS2 · design D6 / D9): the body schema,
// the company-master access, the company row of `system.maintenance` written with its history, one
// audit row `system.maintenance` with branch_id NULL, `settings.changed` after the commit, the system
// status as the answer; the same body again writes nothing. The fixture evening of 05/Oct/2026.
const PATH = '/api/v1/system/maintenance';
const mmt = (local: string) => new Date(`${local}+06:30`);
const ON = {
  enabled: true,
  until: '2026-10-05T22:00:00+06:30',
  message_mm: 'ဆာဗာ ပြင်နေပါတယ်',
  message_en: 'Server update',
};

let s: SeededApp;
const events: DomainEvent[] = [];
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T21:00:00'));
  s.app.get(DomainEvents).on('settings.changed', (event) => {
    events.push(event);
  });
});
afterAll(() => s.close());

const at = (local: string) => s.clock?.set(mmt(local));
const put = async (who: FixturePerson, body: unknown) => {
  const cookie = cookies.get(who) ?? (await s.signIn(who)).cookie;
  cookies.set(who, cookie);
  const res = await s.http
    .put(PATH)
    .set('Cookie', cookie)
    .send(body as object);
  await s.app.get(BackgroundTasks).drain();
  return res;
};
const maintenanceRows = () => s.prisma.settings.findMany({ where: { key: 'system.maintenance' } });
const history = () =>
  s.prisma.settings_history.findMany({
    where: { settings: { key: 'system.maintenance' } },
    orderBy: [{ changed_at: 'asc' }, { id: 'asc' }],
  });
const audits = () =>
  s.prisma.audit_events.findMany({
    where: { action: 'system.maintenance' },
    orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
  });
const status = async () =>
  (await s.http.get('/api/v1/system/status')).body as { maintenance: boolean };

describe('add-settings-store · settings · Maintenance mode is switched by a company-scope settings.update holder', () => {
  it('Scenario: Branch scope is not enough', async () => {
    const res = await put('E002', { enabled: true });
    expect([res.status, res.body.code]).toStrictEqual([403, 'company_scope_required']);
    expect((await status()).maintenance).toBe(false);
  });

  it('a barber without settings.update is 403 forbidden naming the code', async () => {
    const res = await put('E004', { enabled: true });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'settings.update' } });
  });

  it('Scenario: A message that is too long', async () => {
    const res = await put('E001', { enabled: true, message_en: 'e'.repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation',
      errors: [{ field: 'message_en', code: 'too_big', params: { maximum: 200 } }],
    });
  });

  it('enabled is required and until must carry an offset', async () => {
    expect((await put('E001', {})).body).toMatchObject({
      code: 'validation',
      errors: [{ field: 'enabled', code: 'invalid_type' }],
    });
    expect((await put('E001', { enabled: true, until: '2026-10-05T22:00:00' })).body).toMatchObject(
      { code: 'validation', errors: [{ field: 'until' }] },
    );
  });

  it('every refused request wrote no row, no history, no audit row and no event', async () => {
    expect(await maintenanceRows()).toStrictEqual([]);
    expect(await audits()).toStrictEqual([]);
    expect(events).toStrictEqual([]);
  });

  it('Scenario: Turn maintenance on', async () => {
    at('2026-10-05T21:00:00');
    const res = await put('E001', ON);
    expect([res.status, res.body]).toStrictEqual([
      200,
      {
        maintenance: true,
        until: '2026-10-05T22:00:00+06:30',
        message_mm: 'ဆာဗာ ပြင်နေပါတယ်',
        message_en: 'Server update',
        version: '0.1.0',
        server_time: '2026-10-05T21:00:00+06:30',
      },
    ]);
    const [row] = await maintenanceRows();
    expect(row).toMatchObject({
      branch_id: null,
      value: ON,
      updated_by_user_id: FIXTURE_IDS.users.E001,
      updated_at: mmt('2026-10-05T21:00:00'),
    });
    expect((await history()).map((item) => [item.old_value, item.new_value])).toStrictEqual([
      [null, ON],
    ]);
    expect(await audits()).toMatchObject([
      {
        action: 'system.maintenance',
        entity_type: 'settings',
        entity_id: row?.id,
        branch_id: null,
        actor_user_id: FIXTURE_IDS.users.E001,
        before_data: { key: 'system.maintenance', branch_id: null, value: null },
        after_data: { key: 'system.maintenance', branch_id: null, value: ON },
      },
    ]);
    expect(events).toStrictEqual([
      { name: 'settings.changed', payload: { key: 'system.maintenance', branch_id: null } },
    ]);
  });

  it('the same body again writes nothing — no history, no audit row, no event', async () => {
    at('2026-10-05T21:01:00');
    const res = await put('E001', ON);
    expect([res.status, res.body.maintenance]).toStrictEqual([200, true]);
    expect(await maintenanceRows()).toMatchObject([{ updated_at: mmt('2026-10-05T21:00:00') }]);
    expect(await history()).toHaveLength(1);
    expect(await audits()).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it('Scenario: The expected end passes', async () => {
    at('2026-10-05T22:30:00');
    expect((await status()).maintenance).toBe(true);
  });

  it('Scenario: Turn it off', async () => {
    at('2026-10-05T22:15:00');
    const res = await put('E001', { enabled: false });
    expect([res.status, res.body]).toStrictEqual([
      200,
      {
        maintenance: false,
        until: null,
        message_mm: null,
        message_en: null,
        version: '0.1.0',
        server_time: '2026-10-05T22:15:00+06:30',
      },
    ]);
    const off = { enabled: false, until: null, message_mm: null, message_en: null };
    expect(await maintenanceRows()).toMatchObject([{ value: off }]);
    expect((await history()).map((item) => item.new_value)).toStrictEqual([ON, off]);
    expect((await audits()).map((row) => [row.before_data, row.after_data])).toStrictEqual([
      [
        { key: 'system.maintenance', branch_id: null, value: null },
        { key: 'system.maintenance', branch_id: null, value: ON },
      ],
      [
        { key: 'system.maintenance', branch_id: null, value: ON },
        { key: 'system.maintenance', branch_id: null, value: off },
      ],
    ]);
    expect(events).toHaveLength(2);
  });
});
