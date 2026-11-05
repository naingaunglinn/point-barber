import { settingHistoryPageSchema, settingListSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { uuidV7 } from '../src/common/http/uuid-v7.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';
import { storeSetting } from './helpers/settings.js';

// add-settings-store tasks 3.1 – 3.4 and 3.11 — the read endpoints (P1.SET.01 · P1.SET.02 · P1.SET.05 ·
// P1-RULE-13 · API-PERM-03 · API-DATA-08 · ADR-012 · design D5): the list for any settings code with
// the branch values filtered by the store, `editable`, the client-readable values for every staff
// member, and the history of one value. The fixture day: Monday 05/Oct/2026.
const { B1, B3 } = FIXTURE_IDS.branches;
const API = '/api/v1/settings';
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T09:00:00'));
});
afterAll(() => s.close());

const at = (local: string) => s.clock?.set(mmt(local));
const get = async (who: FixturePerson, path: string) => {
  const cookie = cookies.get(who) ?? (await s.signIn(who)).cookie;
  cookies.set(who, cookie);
  return s.http.get(`${API}${path}`).set('Cookie', cookie);
};
const itemOf = (body: { items: { key: string }[] }, key: string) =>
  body.items.find((item) => item.key === key);

describe('add-settings-store · settings · Setting definitions live in one file in code', () => {
  it('Scenario: Nothing is written at start', async () => {
    expect(await s.prisma.settings.count()).toBe(0);
    const res = await get('E001', '');
    expect(res.status).toBe(200);
    const items = settingListSchema.parse(res.body).items;
    expect(items).toHaveLength(14);
    for (const item of items) {
      expect([item.key, item.source, item.company_value]).toStrictEqual([
        item.key,
        'default',
        null,
      ]);
    }
  });
});

describe('add-settings-store · settings · The settings of this change and their defaults', () => {
  it('Scenario: Defaults on a fresh database', async () => {
    const { body } = await get('E001', '');
    expect(
      Object.fromEntries(
        (body as { items: { key: string; effective: unknown }[] }).items.map((item) => [
          item.key,
          item.effective,
        ]),
      ),
    ).toStrictEqual({
      'booking.advance_window_days': 14,
      'booking.slot_interval_minutes': 15,
      'home_service.transport_fee_amount': 0,
      'home_service.travel_minutes': 30,
      'receipt.auto_print': false,
      'receipt.printer_width_mm': 58,
      'receipt.thank_you_text': null,
      'sales.service_charge_enabled': false,
      'sales.tax_enabled': false,
      'closing.cash_difference_tolerance_amount': 0,
      'dashboard.show_own_earnings_all': false,
      'system.default_language': 1,
      'system.maintenance': { enabled: false },
      'system.upload_max_mb': 10,
    });
  });

  it('Scenario: The client-readable set', async () => {
    at('2026-10-05T10:00:00');
    const res = await get('E004', '/effective');
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      values: {
        'booking.advance_window_days': 14,
        'booking.slot_interval_minutes': 15,
        'home_service.transport_fee_amount': 0,
        'receipt.auto_print': false,
        'receipt.printer_width_mm': 58,
        'sales.service_charge_enabled': false,
        'sales.tax_enabled': false,
        'closing.cash_difference_tolerance_amount': 0,
        'system.default_language': 1,
        'system.upload_max_mb': 10,
      },
      as_of: '2026-10-05T10:00:00+06:30',
    });
  });

  it('Scenario: Which keys allow a branch override', async () => {
    const { body } = await get('E001', '');
    const items = settingListSchema.parse(body).items;
    expect(
      items.filter((item) => item.definition.scope === 'branch').map((item) => item.key),
    ).toStrictEqual([
      'home_service.transport_fee_amount',
      'home_service.travel_minutes',
      'receipt.printer_width_mm',
    ]);
    expect(items.filter((item) => item.definition.scope === 'company')).toHaveLength(11);
  });
});

describe('add-settings-store · settings · editable says which value the caller may change', () => {
  const editable = async (who: FixturePerson, query = '') =>
    Object.fromEntries(
      settingListSchema
        .parse((await get(who, query)).body)
        .items.map((item) => [item.key, item.editable]),
    );

  it('Scenario: The admin', async () => {
    expect(await editable('E001')).toMatchObject({
      'booking.slot_interval_minutes': true,
      'system.maintenance': false,
      'sales.tax_enabled': false,
      'sales.service_charge_enabled': false,
    });
  });

  it('Scenario: A manager without a branch', async () => {
    expect(new Set(Object.values(await editable('E002')))).toStrictEqual(new Set([false]));
  });

  it('Scenario: A manager for her branch', async () => {
    expect(await editable('E002', `?branch_id=${B3}`)).toMatchObject({
      'home_service.transport_fee_amount': true,
      'home_service.travel_minutes': true,
      'receipt.printer_width_mm': true,
      'booking.slot_interval_minutes': false,
    });
  });

  it('Ko Zaw at B1 may change the B1 printer width', async () => {
    expect(await editable('E003', `?branch_id=${B1}`)).toMatchObject({
      'receipt.printer_width_mm': true,
    });
  });
});

describe('add-settings-store · settings · The settings list shows each key with its values to holders of a settings code', () => {
  beforeAll(async () => {
    at('2026-10-05T09:10:00');
    await storeSetting(s, 'home_service.transport_fee_amount', 2000);
    at('2026-10-05T09:20:00');
    await storeSetting(s, 'home_service.transport_fee_amount', 3000, { branchId: B3, by: 'E002' });
  });

  it('Scenario: The admin with a branch', async () => {
    const res = await get('E001', `?branch_id=${B3}`);
    expect(res.status).toBe(200);
    expect(
      itemOf(settingListSchema.parse(res.body), 'home_service.transport_fee_amount'),
    ).toMatchObject({
      company_value: 2000,
      branch_value: 3000,
      effective: 3000,
      source: 'branch',
      editable: true,
      updated_at: '2026-10-05T09:20:00+06:30',
      updated_by: { id: FIXTURE_IDS.users.E002, name_mm: 'မနှင်း', name_en: 'Ma Hnin' },
      definition: {
        type: 'number',
        scope: 'branch',
        module: 'booking',
        default: 0,
        label_key: 'settings.home_service.transport_fee_amount.label',
        help_key: 'settings.home_service.transport_fee_amount.help',
        impact_key: 'settings.home_service.transport_fee_amount.impact',
        validation: { unit: 'MMK', min: 0 },
        client_readable: true,
      },
    });
  });

  it('Scenario: A manager reads the company values', async () => {
    const res = await get('E002', '');
    expect(res.status).toBe(200);
    const items = settingListSchema.parse(res.body).items;
    expect(items).toHaveLength(14);
    expect(itemOf({ items }, 'home_service.transport_fee_amount')).toMatchObject({
      company_value: 2000,
      effective: 2000,
      source: 'company',
      updated_at: '2026-10-05T09:10:00+06:30',
      updated_by: { name_en: 'U Kyaw Zin' },
    });
    expect(items.some((item) => 'branch_value' in item)).toBe(false);
  });

  it('Scenario: A manager asks for another branch', async () => {
    const res = await get('E002', `?branch_id=${B1}`);
    expect([res.status, res.body]).toStrictEqual([200, { items: [] }]);
  });

  it('a branch_id that is no branch is an empty list too (design D5)', async () => {
    const res = await get('E001', `?branch_id=${uuidV7(Date.now())}`);
    expect([res.status, res.body]).toStrictEqual([200, { items: [] }]);
  });

  it('Scenario: One module', async () => {
    const res = await get('E001', '?module=closing');
    expect(settingListSchema.parse(res.body).items.map((item) => item.key)).toStrictEqual([
      'closing.cash_difference_tolerance_amount',
    ]);
  });

  it('Scenario: A barber has no settings code', async () => {
    const res = await get('E004', '');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'settings.view' } });
  });

  it('a malformed branch_id is 400 validation at branch_id', async () => {
    const res = await get('E001', '?branch_id=B3');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', errors: [{ field: 'branch_id' }] });
  });
});

describe('add-settings-store · settings · Screens read effective values through one endpoint', () => {
  beforeAll(async () => {
    await storeSetting(s, 'receipt.printer_width_mm', 80, { branchId: B3, by: 'E002' });
  });

  it('Scenario: Branch values for a barber', async () => {
    at('2026-10-05T10:00:00');
    const res = await get(
      'E004',
      `/effective?branch_id=${B3}&keys=receipt.printer_width_mm,home_service.transport_fee_amount`,
    );
    expect([res.status, res.body]).toStrictEqual([
      200,
      {
        values: { 'receipt.printer_width_mm': 80, 'home_service.transport_fee_amount': 3000 },
        as_of: '2026-10-05T10:00:00+06:30',
      },
    ]);
  });

  it('Scenario: A key that is not client-readable', async () => {
    const res = await get('E004', '/effective?keys=dashboard.show_own_earnings_all');
    expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
  });

  it('Scenario: A branch outside the read scope', async () => {
    const res = await get('E006', `/effective?branch_id=${B3}`);
    expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
  });

  it('Scenario: A company-only key asked for a branch', async () => {
    await storeSetting(s, 'booking.advance_window_days', 7);
    const res = await get('E004', `/effective?branch_id=${B3}&keys=booking.advance_window_days`);
    expect(res.body.values).toStrictEqual({ 'booking.advance_window_days': 7 });
  });

  it('an unknown key is 404 like a key that is not client-readable', async () => {
    expect((await get('E004', '/effective?keys=booking.slot_size')).status).toBe(404);
  });
});

describe('add-settings-store · settings · Each setting has its history', () => {
  const history = async (who: FixturePerson, key: string, query = '') =>
    get(who, `/${key}/history${query}`);

  beforeAll(async () => {
    at('2026-10-05T09:00:00');
    await storeSetting(s, 'booking.slot_interval_minutes', 30);
    at('2026-10-05T09:05:00');
    await storeSetting(s, 'booking.slot_interval_minutes', 15);
  });

  it('Scenario: Company history', async () => {
    const res = await history('E001', 'booking.slot_interval_minutes');
    expect(res.status).toBe(200);
    const page = settingHistoryPageSchema.parse(res.body);
    const kyawZin = { id: FIXTURE_IDS.users.E001, name_mm: 'ဦးကျော်ဇင်', name_en: 'U Kyaw Zin' };
    expect(
      page.items.map(({ branch_id, old_value, new_value, changed_by }) => ({
        branch_id,
        old_value,
        new_value,
        changed_by,
      })),
    ).toStrictEqual([
      { branch_id: null, old_value: 30, new_value: 15, changed_by: kyawZin },
      { branch_id: null, old_value: null, new_value: 30, changed_by: kyawZin },
    ]);
    // `changed_at` is the trigger's now() (settings_history.changed_at DEFAULT now() — DB Part 8),
    // not the test clock: an instant with the Myanmar offset, newest first.
    const [newer, older] = page.items.map((item) => item.changed_at);
    expect(newer).toMatch(/\+06:30$/);
    expect(Date.parse(newer ?? '')).toBeGreaterThanOrEqual(Date.parse(older ?? ''));
    expect(page.next_cursor).toBeNull();
  });

  it('Scenario: A manager reads her branch', async () => {
    const res = await history('E002', 'home_service.transport_fee_amount', `?branch_id=${B3}`);
    expect(res.status).toBe(200);
    const page = settingHistoryPageSchema.parse(res.body);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((item) => item.branch_id === B3)).toBe(true);
  });

  it('Scenario: Another branch', async () => {
    const res = await history('E002', 'home_service.transport_fee_amount', `?branch_id=${B1}`);
    expect([res.status, res.body]).toStrictEqual([200, { items: [], next_cursor: null }]);
  });

  it('a manager reads the company history too (any settings code — P1.SET.05)', async () => {
    const res = await history('E002', 'booking.slot_interval_minutes');
    expect(settingHistoryPageSchema.parse(res.body).items).toHaveLength(2);
  });

  it('a barber is 403 forbidden', async () => {
    const res = await history('E004', 'booking.slot_interval_minutes');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'settings.view' } });
  });

  it('an unknown key is 404; a malformed key is 400 validation at key', async () => {
    expect((await history('E001', 'booking.slot_size')).status).toBe(404);
    const malformed = await history('E001', 'BOOKING');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ code: 'validation', errors: [{ field: 'key' }] });
  });

  it('the history of a read-only key is readable', async () => {
    const res = await history('E001', 'system.maintenance');
    expect([res.status, res.body]).toStrictEqual([200, { items: [], next_cursor: null }]);
  });

  it('Scenario: Paging — 27 changes: 25 and a cursor, then 2 and null', async () => {
    for (let change = 0; change < 27; change += 1) {
      await storeSetting(s, 'receipt.auto_print', change % 2 === 0);
    }
    const first = await history('E001', 'receipt.auto_print');
    const page1 = settingHistoryPageSchema.parse(first.body);
    expect(page1.items).toHaveLength(25);
    expect(page1.next_cursor).not.toBeNull();
    const second = await history(
      'E001',
      'receipt.auto_print',
      `?cursor=${page1.next_cursor ?? ''}`,
    );
    const page2 = settingHistoryPageSchema.parse(second.body);
    expect(page2.items).toHaveLength(2);
    expect(page2.next_cursor).toBeNull();
    // Newest first, no item twice; the oldest is the first write (old_value null).
    const all = [...page1.items, ...page2.items];
    expect(new Set(all.map((item) => item.id)).size).toBe(27);
    expect(all[0]?.new_value).toBe(true);
    expect(all.at(-1)).toMatchObject({ old_value: null, new_value: true });
  });

  it('limit is 1 – 100: 0 and 101 are 400 validation', async () => {
    for (const limit of [0, 101]) {
      const res = await history('E001', 'receipt.auto_print', `?limit=${limit}`);
      expect([res.status, res.body.errors?.[0]?.field]).toStrictEqual([400, 'limit']);
    }
  });
});
