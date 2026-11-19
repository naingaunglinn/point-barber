import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { uuidV7 } from '../src/common/http/uuid-v7.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-settings-store tasks 3.5 – 3.6 — P1.SET.03 / 04 access and refusals (P1.SET.03 · P1.SET.04 ·
// P1-RULE-08 · P1-RULE-13 · API-PERM-07 · ADR-012 · owner SS3 / SS4 · design D5): a company value needs
// company-scope settings.update, a branch override settings.update for that branch and a branch key;
// an unknown key is 404, a malformed one 400 at `key`, a read-only key and a branch override of a
// company-only key 400 setting_scope, a value outside its schema 400 validation at its field. Every
// refused write leaves no row, no history row and no audit row. Monday 05/Oct/2026.
const { B1, B2, B3 } = FIXTURE_IDS.branches;
const API = '/api/v1/settings';
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T09:00:00'));
});
afterAll(() => s.close());

const at = (local: string) => s.clock?.set(mmt(local));
const cookieOf = async (who: FixturePerson) => {
  const cookie = cookies.get(who) ?? (await s.signIn(who)).cookie;
  cookies.set(who, cookie);
  return cookie;
};
const put = async (who: FixturePerson, key: string, body: object) =>
  s.http
    .put(`${API}/${key}`)
    .set('Cookie', await cookieOf(who))
    .send(body);
const reset = async (who: FixturePerson, key: string, body?: object) => {
  const req = s.http.post(`${API}/${key}/reset`).set('Cookie', await cookieOf(who));
  return body === undefined ? req : req.send(body);
};
const effectiveAt = async (key: string, branchId?: string) => {
  const query = branchId === undefined ? '' : `?branch_id=${branchId}`;
  const res = await s.http.get(`${API}${query}`).set('Cookie', await cookieOf('E001'));
  return (res.body as { items: { key: string; effective: unknown; source: string }[] }).items.find(
    (item) => item.key === key,
  );
};
const written = async () => ({
  rows: await s.prisma.settings.count(),
  history: await s.prisma.settings_history.count(),
  audits: await s.prisma.audit_events.count({
    where: { action: { in: ['settings.set', 'settings.reset'] } },
  }),
});

describe('add-settings-store · settings · A company value needs settings.update at company scope', () => {
  it('Scenario: A branch manager cannot change a company value', async () => {
    const res = await put('E002', 'booking.slot_interval_minutes', { value: 30 });
    expect([res.status, res.body.code]).toStrictEqual([403, 'company_scope_required']);
    expect(await effectiveAt('booking.slot_interval_minutes')).toMatchObject({ effective: 15 });
  });

  it('Scenario: A barber cannot write', async () => {
    const res = await put('E004', 'receipt.auto_print', { value: true });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'settings.update' } });
  });

  it('a manager cannot reset a company value, a barber cannot reset at all', async () => {
    expect((await reset('E002', 'booking.slot_interval_minutes')).body.code).toBe(
      'company_scope_required',
    );
    expect((await reset('E004', 'booking.slot_interval_minutes', {})).body).toMatchObject({
      code: 'forbidden',
      context: { required: 'settings.update' },
    });
  });

  it('Scenario: The admin sets a company value', async () => {
    const before = await written();
    expect(before).toStrictEqual({ rows: 0, history: 0, audits: 0 });
    at('2026-10-05T09:00:00');
    const res = await put('E001', 'booking.slot_interval_minutes', { value: 30 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      key: 'booking.slot_interval_minutes',
      company_value: 30,
      effective: 30,
      source: 'company',
      editable: true,
      updated_by: { id: FIXTURE_IDS.users.E001, name_en: 'U Kyaw Zin' },
      updated_at: '2026-10-05T09:00:00+06:30',
    });
    expect(res.body).not.toHaveProperty('branch_value');
  });
});

describe('add-settings-store · settings · A branch override needs settings.update for that branch and a branch-scoped key', () => {
  it('Scenario: Another branch', async () => {
    const before = await written();
    const res = await put('E002', 'home_service.transport_fee_amount', {
      value: 3000,
      branch_id: B1,
    });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'settings.update' } });
    expect(await effectiveAt('home_service.transport_fee_amount', B1)).toMatchObject({
      effective: 0,
      source: 'default',
    });
    expect(await written()).toStrictEqual(before);
  });

  it('Scenario: A manager overrides her branch', async () => {
    at('2026-10-05T09:20:00');
    const res = await put('E002', 'home_service.transport_fee_amount', {
      value: 3000,
      branch_id: B3,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      branch_value: 3000,
      effective: 3000,
      source: 'branch',
      editable: true,
      updated_by: { name_en: 'Ma Hnin' },
      updated_at: '2026-10-05T09:20:00+06:30',
    });
  });

  it('Scenario: The admin overrides any branch — B1 travel 45, B2 and B3 keep 30', async () => {
    const res = await put('E001', 'home_service.travel_minutes', { value: 45, branch_id: B1 });
    expect([res.status, res.body.effective]).toStrictEqual([200, 45]);
    expect(await effectiveAt('home_service.travel_minutes', B1)).toMatchObject({ effective: 45 });
    expect(await effectiveAt('home_service.travel_minutes', B2)).toMatchObject({ effective: 30 });
    expect(await effectiveAt('home_service.travel_minutes', B3)).toMatchObject({ effective: 30 });
  });

  it('Scenario: A company-only key', async () => {
    const before = await written();
    const res = await put('E001', 'booking.advance_window_days', { value: 7, branch_id: B3 });
    expect([res.status, res.body.code]).toStrictEqual([400, 'setting_scope']);
    expect(await written()).toStrictEqual(before);
  });

  it('Scenario: A branch that does not exist', async () => {
    const res = await put('E001', 'home_service.transport_fee_amount', {
      value: 1000,
      branch_id: uuidV7(Date.now()),
    });
    expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
  });

  it('branch_id null is the company value', async () => {
    const res = await put('E002', 'home_service.travel_minutes', { value: 40, branch_id: null });
    expect([res.status, res.body.code]).toStrictEqual([403, 'company_scope_required']);
  });
});

describe('add-settings-store · settings · Unknown keys and keys written elsewhere are refused', () => {
  it('Scenario: An unknown key', async () => {
    const res = await put('E001', 'booking.slot_size', { value: 15 });
    expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
    expect((await reset('E001', 'booking.slot_size')).status).toBe(404);
  });

  it('a malformed key is 400 validation at key', async () => {
    for (const res of [
      await put('E001', 'BOOKING', { value: 15 }),
      await reset('E001', 'booking'),
    ]) {
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'validation', errors: [{ field: 'key' }] });
    }
  });

  it('Scenario: Maintenance is not written here', async () => {
    const before = await written();
    const res = await put('E001', 'system.maintenance', { value: { enabled: true } });
    expect([res.status, res.body.code]).toStrictEqual([400, 'setting_scope']);
    expect((await reset('E001', 'system.maintenance')).body.code).toBe('setting_scope');
    expect((await s.http.get('/api/v1/system/status')).body.maintenance).toBe(false);
    expect(await written()).toStrictEqual(before);
  });

  it('Scenario: The tax switch stays off', async () => {
    const before = await written();
    const tax = await put('E001', 'sales.tax_enabled', { value: true });
    const charge = await reset('E001', 'sales.service_charge_enabled');
    expect([tax.status, tax.body.code]).toStrictEqual([400, 'setting_scope']);
    expect([charge.status, charge.body.code]).toStrictEqual([400, 'setting_scope']);
    // With a branch too (read-only "with or without branch_id").
    expect((await put('E001', 'sales.tax_enabled', { value: true, branch_id: B3 })).body.code).toBe(
      'setting_scope',
    );
    const me = await s.http.get('/api/v1/me').set('Cookie', await cookieOf('E001'));
    expect(me.body.settings['sales.tax_enabled']).toBe(false);
    expect(await written()).toStrictEqual(before);
  });
});

describe('add-settings-store · settings · Number settings are whole numbers within their limits', () => {
  it('Scenario: Zero transport fee', async () => {
    const res = await put('E001', 'home_service.transport_fee_amount', { value: 0 });
    expect([res.status, res.body.effective]).toStrictEqual([200, 0]);
  });

  it('Scenario: Negative tolerance', async () => {
    const res = await put('E001', 'closing.cash_difference_tolerance_amount', { value: -1 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation',
      errors: [{ field: 'value', code: 'too_small', params: { minimum: 0 } }],
    });
    expect(res.body.errors).toHaveLength(1);
    expect(await effectiveAt('closing.cash_difference_tolerance_amount')).toMatchObject({
      effective: 0,
    });
  });

  it('Scenario: Not a whole number', async () => {
    const before = await written();
    for (const value of [30.5, '30']) {
      const res = await put('E001', 'home_service.travel_minutes', { value });
      expect(res.status).toBe(400);
      expect(res.body.errors).toMatchObject([{ field: 'value', code: 'invalid_type' }]);
    }
    expect(await written()).toStrictEqual(before);
  });

  it('Scenario: Upload size at its limits', async () => {
    expect((await put('E001', 'system.upload_max_mb', { value: 10 })).status).toBe(200);
    expect((await put('E001', 'system.upload_max_mb', { value: 1 })).status).toBe(200);
    expect((await put('E001', 'system.upload_max_mb', { value: 11 })).body.errors).toMatchObject([
      { field: 'value', code: 'too_big', params: { maximum: 10 } },
    ]);
    expect((await put('E001', 'system.upload_max_mb', { value: 0 })).body.errors).toMatchObject([
      { field: 'value', code: 'too_small', params: { minimum: 1 } },
    ]);
  });

  it('Scenario: Advance window of zero days', async () => {
    const res = await put('E001', 'booking.advance_window_days', { value: 0 });
    expect([res.status, res.body.effective]).toStrictEqual([200, 0]);
  });

  it('a missing value is 400 validation at value', async () => {
    const res = await put('E001', 'receipt.auto_print', {});
    expect(res.status).toBe(400);
    expect(res.body.errors).toMatchObject([{ field: 'value', code: 'invalid_type' }]);
  });
});

describe('add-settings-store · settings · Choice and switch settings accept only their listed values', () => {
  it('Scenario: A listed interval', async () => {
    const res = await put('E001', 'booking.slot_interval_minutes', { value: 30 });
    expect([res.status, res.body.effective]).toStrictEqual([200, 30]);
  });

  it('Scenario: An interval that is not listed', async () => {
    await put('E001', 'booking.slot_interval_minutes', { value: 15 });
    const res = await put('E001', 'booking.slot_interval_minutes', { value: 20 });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toStrictEqual({ field: 'value', code: 'invalid_value' });
    expect(await effectiveAt('booking.slot_interval_minutes')).toMatchObject({ effective: 15 });
  });

  it('Scenario: Printer width', async () => {
    expect(
      (await put('E002', 'receipt.printer_width_mm', { value: 80, branch_id: B3 })).status,
    ).toBe(200);
    const res = await put('E002', 'receipt.printer_width_mm', { value: 76, branch_id: B3 });
    expect([res.status, res.body.errors[0]?.code]).toStrictEqual([400, 'invalid_value']);
  });

  it('Scenario: Language code', async () => {
    const res = await put('E001', 'system.default_language', { value: 3 });
    expect([res.status, res.body.errors[0]?.code]).toStrictEqual([400, 'invalid_value']);
    expect(await effectiveAt('system.default_language')).toMatchObject({ effective: 1 });
  });

  it('Scenario: A switch is a boolean', async () => {
    const res = await put('E001', 'receipt.auto_print', { value: 'yes' });
    expect([res.status, res.body.errors[0]?.code]).toStrictEqual([400, 'invalid_type']);
  });
});

describe('add-settings-store · settings · The receipt thank-you text', () => {
  it('Scenario: Text lengths', async () => {
    const ok = await put('E001', 'receipt.thank_you_text', {
      value: { mm: 'ကျေးဇူးတင်ပါတယ်', en: 'e'.repeat(200) },
    });
    expect(ok.status).toBe(200);
    const long = await put('E001', 'receipt.thank_you_text', {
      value: { mm: 'ကျေးဇူးတင်ပါတယ်', en: 'e'.repeat(201) },
    });
    expect(long.body.errors).toMatchObject([
      { field: 'value.en', code: 'too_big', params: { maximum: 200 } },
    ]);
    const empty = await put('E001', 'receipt.thank_you_text', {
      value: { mm: '   ', en: 'Thank you!' },
    });
    expect(empty.body.errors).toMatchObject([
      { field: 'value.mm', code: 'too_small', params: { minimum: 1 } },
    ]);
  });

  it('Scenario: Myanmar only prints no line — the stored value has en null', async () => {
    const res = await put('E001', 'receipt.thank_you_text', {
      value: { mm: 'ကျေးဇူးတင်ပါတယ်', en: '  ' },
    });
    expect(res.body.effective).toStrictEqual({ mm: 'ကျေးဇူးတင်ပါတယ်', en: null });
    expect(
      (await s.prisma.settings.findFirstOrThrow({ where: { key: 'receipt.thank_you_text' } }))
        .value,
    ).toStrictEqual({ mm: 'ကျေးဇူးတင်ပါတယ်', en: null });
  });

  it('null is accepted and means no thank-you line', async () => {
    const res = await put('E001', 'receipt.thank_you_text', { value: null });
    expect([res.status, res.body.effective]).toStrictEqual([200, null]);
  });
});
