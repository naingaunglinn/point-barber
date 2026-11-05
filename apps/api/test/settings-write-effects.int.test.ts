import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DomainEvents, type DomainEvent } from '../src/common/events/domain-events.js';
import { BackgroundTasks } from '../src/common/http/background-tasks.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-settings-store tasks 3.8 – 3.10 — the effects of P1.SET.03 / 04 (P1-RULE-08 · P1-RULE-10 ·
// API-AUD-01 · API-IDEM-02 · P1.SET.04 · AD-SET-02 · D-DAT-05 · design D6 / D7): a new value writes the
// row, one history row (the trigger) and one audit row, and announces `settings.changed` once after the
// commit; the same value again writes nothing; two writers of one key serialise; reset copies the parent
// value with an update, never a delete. Monday 05/Oct/2026.
const { B1, B2, B3 } = FIXTURE_IDS.branches;
const API = '/api/v1/settings';
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const events: DomainEvent[] = [];
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T09:00:00'), { poolSize: 6 });
  s.app.get(DomainEvents).on('settings.changed', (event) => {
    events.push(event);
  });
});
afterAll(() => s.close());

const at = (local: string) => s.clock?.set(mmt(local));
const cookieOf = async (who: FixturePerson) => {
  const cookie = cookies.get(who) ?? (await s.signIn(who)).cookie;
  cookies.set(who, cookie);
  return cookie;
};
const settled = async <T>(res: T): Promise<T> => {
  await s.app.get(BackgroundTasks).drain();
  return res;
};
const put = async (who: FixturePerson, key: string, body: object) =>
  settled(
    await s.http
      .put(`${API}/${key}`)
      .set('Cookie', await cookieOf(who))
      .send(body),
  );
const reset = async (who: FixturePerson, key: string, body: object = {}) =>
  settled(
    await s.http
      .post(`${API}/${key}/reset`)
      .set('Cookie', await cookieOf(who))
      .send(body),
  );
const view = async (key: string, branchId?: string) => {
  const query = branchId === undefined ? '' : `?branch_id=${branchId}`;
  const res = await s.http.get(`${API}${query}`).set('Cookie', await cookieOf('E001'));
  return (res.body as { items: Record<string, unknown>[] }).items.find((item) => item.key === key);
};
const historyOf = (key: string, branchId: string | null) =>
  s.prisma.settings_history.findMany({
    where: { settings: { key, branch_id: branchId } },
    orderBy: [{ changed_at: 'asc' }, { id: 'asc' }],
  });
const auditsOf = (action: string, key: string) =>
  s.prisma.audit_events.findMany({
    where: { action, after_data: { path: ['key'], equals: key } },
    orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
  });
const eventsSince = (count: number) => events.slice(count);

describe('add-settings-store · settings · A changed value is stored once, with its history and one audit row', () => {
  it('Scenario: The first write', async () => {
    at('2026-10-05T09:00:00');
    const res = await put('E001', 'booking.slot_interval_minutes', { value: 30 });
    expect(res.status).toBe(200);
    const rows = await s.prisma.settings.findMany({
      where: { key: 'booking.slot_interval_minutes' },
    });
    expect(rows).toHaveLength(1);
    expect(
      (await historyOf('booking.slot_interval_minutes', null)).map((row) => [
        row.old_value,
        row.new_value,
        row.changed_by_user_id,
      ]),
    ).toStrictEqual([[null, 30, FIXTURE_IDS.users.E001]]);
    expect(await auditsOf('settings.set', 'booking.slot_interval_minutes')).toMatchObject([
      {
        entity_type: 'settings',
        entity_id: rows[0]?.id,
        branch_id: null,
        actor_user_id: FIXTURE_IDS.users.E001,
        before_data: { key: 'booking.slot_interval_minutes', branch_id: null, value: null },
        after_data: { key: 'booking.slot_interval_minutes', branch_id: null, value: 30 },
      },
    ]);
    expect(events).toStrictEqual([
      {
        name: 'settings.changed',
        payload: { key: 'booking.slot_interval_minutes', branch_id: null },
      },
    ]);
  });

  it('Scenario: A change', async () => {
    at('2026-10-05T09:05:00');
    await put('E001', 'booking.slot_interval_minutes', { value: 15 });
    expect(
      (await historyOf('booking.slot_interval_minutes', null)).map((row) => [
        row.old_value,
        row.new_value,
      ]),
    ).toStrictEqual([
      [null, 30],
      [30, 15],
    ]);
    const audits = await auditsOf('settings.set', 'booking.slot_interval_minutes');
    expect(audits).toHaveLength(2);
    expect(audits[1]).toMatchObject({
      before_data: { value: 30 },
      after_data: { value: 15 },
    });
  });

  it('Scenario: The same value again', async () => {
    const seen = events.length;
    at('2026-10-05T09:06:00');
    const res = await put('E001', 'booking.slot_interval_minutes', { value: 15 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      company_value: 15,
      effective: 15,
      source: 'default',
      updated_at: '2026-10-05T09:05:00+06:30',
    });
    expect(await historyOf('booking.slot_interval_minutes', null)).toHaveLength(2);
    expect(await auditsOf('settings.set', 'booking.slot_interval_minutes')).toHaveLength(2);
    expect(eventsSince(seen)).toStrictEqual([]);
  });

  it('a refused write announces nothing', async () => {
    const seen = events.length;
    await put('E001', 'booking.slot_interval_minutes', { value: 20 });
    await put('E002', 'booking.slot_interval_minutes', { value: 30 });
    await put('E001', 'sales.tax_enabled', { value: true });
    expect(eventsSince(seen)).toStrictEqual([]);
  });

  it('Scenario: An override is audited at its branch', async () => {
    at('2026-10-05T09:10:00');
    await put('E001', 'home_service.transport_fee_amount', { value: 2000 });
    const seen = events.length;
    at('2026-10-05T09:20:00');
    await put('E002', 'home_service.transport_fee_amount', { value: 3000, branch_id: B3 });
    const audits = await auditsOf('settings.set', 'home_service.transport_fee_amount');
    expect(audits.map((row) => [row.branch_id, row.actor_user_id])).toStrictEqual([
      [null, FIXTURE_IDS.users.E001],
      [B3, FIXTURE_IDS.users.E002],
    ]);
    expect(audits[1]?.after_data).toStrictEqual({
      key: 'home_service.transport_fee_amount',
      branch_id: B3,
      value: 3000,
    });
    expect(eventsSince(seen)).toStrictEqual([
      {
        name: 'settings.changed',
        payload: { key: 'home_service.transport_fee_amount', branch_id: B3 },
      },
    ]);
  });
});

describe('add-settings-store · settings · The effective value is the branch override, else the company value, else the default', () => {
  it('Scenario: A company value applies to every branch — B1 and B2 read 2,000 from the company', async () => {
    for (const branchId of [B1, B2]) {
      expect(await view('home_service.transport_fee_amount', branchId)).toMatchObject({
        effective: 2000,
        source: 'company',
      });
    }
  });

  it('Scenario: A branch override wins at its branch only', async () => {
    expect(await view('home_service.transport_fee_amount', B3)).toMatchObject({
      effective: 3000,
      source: 'branch',
    });
  });

  it('Scenario: A row equal to its parent', async () => {
    await put('E001', 'home_service.travel_minutes', { value: 30, branch_id: B2 });
    expect(await view('home_service.travel_minutes', B2)).toMatchObject({
      branch_value: 30,
      effective: 30,
      source: 'default',
    });
  });
});

describe('two writers of one key (design D6 · task 3.9)', () => {
  it('the first write of a key from two writers at once (the insert race on settings_scope_key_uq)', async () => {
    const [a, b] = await Promise.all([
      put('E001', 'closing.cash_difference_tolerance_amount', { value: 20000 }),
      put('E001', 'closing.cash_difference_tolerance_amount', { value: 25000 }),
    ]);
    expect([a.status, b.status]).toStrictEqual([200, 200]);
    const history = await historyOf('closing.cash_difference_tolerance_amount', null);
    expect(history).toHaveLength(2);
    expect(history.map((row) => row.new_value).sort()).toStrictEqual([20000, 25000]);
    const [row] = await s.prisma.settings.findMany({
      where: { key: 'closing.cash_difference_tolerance_amount' },
    });
    // The newest history row is the last committed value, and it is the effective one.
    expect(row?.value).toBe(history.at(-1)?.new_value);
    expect(history.at(-1)?.old_value).toBe(history[0]?.new_value);
    expect(await view('closing.cash_difference_tolerance_amount')).toMatchObject({
      effective: row?.value,
    });
  });
});

describe("add-settings-store · settings · Reset sets a value back to its parent's value", () => {
  it('Scenario: Reset a branch override', async () => {
    const seen = events.length;
    at('2026-10-05T11:00:00');
    const res = await reset('E002', 'home_service.transport_fee_amount', { branch_id: B3 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ branch_value: 2000, effective: 2000, source: 'company' });
    const row = await s.prisma.settings.findFirstOrThrow({
      where: { key: 'home_service.transport_fee_amount', branch_id: B3 },
    });
    expect(row).toMatchObject({
      value: 2000,
      updated_by_user_id: FIXTURE_IDS.users.E002,
      updated_at: mmt('2026-10-05T11:00:00'),
    });
    expect(
      (await historyOf('home_service.transport_fee_amount', B3)).map((item) => [
        item.old_value,
        item.new_value,
      ]),
    ).toStrictEqual([
      [null, 3000],
      [3000, 2000],
    ]);
    expect(await auditsOf('settings.reset', 'home_service.transport_fee_amount')).toMatchObject([
      {
        branch_id: B3,
        actor_user_id: FIXTURE_IDS.users.E002,
        entity_id: row.id,
        before_data: { key: 'home_service.transport_fee_amount', branch_id: B3, value: 3000 },
        after_data: { key: 'home_service.transport_fee_amount', branch_id: B3, value: 2000 },
      },
    ]);
    expect(eventsSince(seen)).toStrictEqual([
      {
        name: 'settings.changed',
        payload: { key: 'home_service.transport_fee_amount', branch_id: B3 },
      },
    ]);
  });

  it('Scenario: Reset a company value', async () => {
    await put('E001', 'booking.slot_interval_minutes', { value: 30 });
    const res = await reset('E001', 'booking.slot_interval_minutes');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ company_value: 15, effective: 15, source: 'default' });
    expect(
      (
        await s.prisma.settings.findFirstOrThrow({
          where: { key: 'booking.slot_interval_minutes' },
        })
      ).value,
    ).toBe(15);
  });

  it('Scenario: Nothing to reset', async () => {
    const seen = events.length;
    const before = {
      rows: await s.prisma.settings.count(),
      history: await s.prisma.settings_history.count(),
      audits: await s.prisma.audit_events.count({ where: { action: 'settings.reset' } }),
    };
    const res = await reset('E001', 'home_service.travel_minutes', { branch_id: B1 });
    expect([res.status, res.body.source, res.body.effective]).toStrictEqual([200, 'default', 30]);
    // The row already holds the parent value: nothing either.
    await reset('E002', 'home_service.transport_fee_amount', { branch_id: B3 });
    expect({
      rows: await s.prisma.settings.count(),
      history: await s.prisma.settings_history.count(),
      audits: await s.prisma.audit_events.count({ where: { action: 'settings.reset' } }),
    }).toStrictEqual(before);
    expect(eventsSince(seen)).toStrictEqual([]);
  });

  it('Scenario: The parent changes after a reset', async () => {
    at('2026-10-05T14:00:00');
    await put('E001', 'home_service.transport_fee_amount', { value: 2500 });
    expect(await view('home_service.transport_fee_amount', B3)).toMatchObject({
      effective: 2000,
      source: 'branch',
    });
    for (const branchId of [B1, B2]) {
      expect(await view('home_service.transport_fee_amount', branchId)).toMatchObject({
        effective: 2500,
        source: 'company',
      });
    }
  });

  it('Scenario: A manager cannot reset a company value', async () => {
    const res = await reset('E002', 'booking.slot_interval_minutes');
    expect([res.status, res.body.code]).toStrictEqual([403, 'company_scope_required']);
  });

  it('a read-only key is 400 setting_scope; a company-only key with a branch too', async () => {
    expect((await reset('E001', 'sales.service_charge_enabled')).body.code).toBe('setting_scope');
    expect(
      (await reset('E001', 'booking.slot_interval_minutes', { branch_id: B3 })).body.code,
    ).toBe('setting_scope');
  });

  it('a settings row is never deleted', async () => {
    const keys = (await s.prisma.settings.findMany({ select: { key: true } })).map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'booking.slot_interval_minutes',
        'home_service.transport_fee_amount',
        'home_service.travel_minutes',
        'closing.cash_difference_tolerance_amount',
      ]),
    );
  });
});

describe('two writers of one key (design D6 · task 3.9)', () => {
  it('two parallel PUTs of 20,000 and 25,000 on the company transport fee: two history rows, the last commit wins', async () => {
    const before = (await historyOf('home_service.transport_fee_amount', null)).length;
    const [a, b] = await Promise.all([
      put('E001', 'home_service.transport_fee_amount', { value: 20000 }),
      put('E001', 'home_service.transport_fee_amount', { value: 25000 }),
    ]);
    expect([a.status, b.status]).toStrictEqual([200, 200]);
    const added = (await historyOf('home_service.transport_fee_amount', null)).slice(before);
    expect(added.map((row) => row.new_value).sort()).toStrictEqual([20000, 25000]);
    // Serialised on the row lock: the second compared against the first's committed value.
    expect(added[1]?.old_value).toBe(added[0]?.new_value);
    const row = await s.prisma.settings.findFirstOrThrow({
      where: { key: 'home_service.transport_fee_amount', branch_id: null },
    });
    expect(row.value).toBe(added[1]?.new_value);
    expect(await view('home_service.transport_fee_amount', B1)).toMatchObject({
      effective: row.value,
    });
  });
});
