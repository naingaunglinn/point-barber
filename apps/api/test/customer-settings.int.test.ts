import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { customerHistory } from './builders/customers.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-customer-management task 3.12 — customers spec "The preferred-barber settings are company values
// with min ≤ window" (Part 3 §10 · P1-RULE-08 · owner CM3: no maximum) through PUT /v1/settings/{key}
// of add-settings-store (merged), and the detail reading the new minimum on the next read (design D6 ·
// D9). U Kyaw Zin on Monday 05/Oct/2026 at 9:00 AM.
const { branches, customers } = FIXTURE_IDS;
const WINDOW = 'customer.preferred_barber_window';
const MIN = 'customer.preferred_barber_min_visits';

let s: SeededApp;
let cookie = '';

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T09:00:00+06:30'));
  await customerHistory(s.prisma, []);
  cookie = (await s.signIn('E001')).cookie;
});
afterAll(() => s.close());

const put = (key: string, body: object) =>
  s.http.put(`/api/v1/settings/${key}`).set('Cookie', cookie).send(body);
const effective = async (key: string) => {
  const res = await s.http.get('/api/v1/settings?module=customer').set('Cookie', cookie);
  const item = (res.body as { items: { key: string; effective: unknown; source: string }[] }).items.find(
    (entry) => entry.key === key,
  );
  return [item?.effective, item?.source];
};
const preferred = async () =>
  (await s.http.get(`/api/v1/customers/${customers.MA_SU}`).set('Cookie', cookie)).body.stats
    .preferred_employee?.id;

describe('add-customer-management · customers · The preferred-barber settings are company values with min ≤ window', () => {
  it('Scenario: The defaults — 5 and 3, both from the default', async () => {
    expect(await effective(WINDOW)).toStrictEqual([5, 'default']);
    expect(await effective(MIN)).toStrictEqual([3, 'default']);
  });

  it('Scenario: A window below the minimum — 400 too_small with minimum 3', async () => {
    const res = await put(WINDOW, { value: 2 });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toStrictEqual({
      field: 'value',
      code: 'too_small',
      params: { minimum: 3 },
    });
  });

  it('Scenario: A minimum above the window — 400 too_big with maximum 5, the stored minimum unchanged', async () => {
    const res = await put(MIN, { value: 6 });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toStrictEqual({
      field: 'value',
      code: 'too_big',
      params: { maximum: 5 },
    });
    expect(await effective(MIN)).toStrictEqual([3, 'default']);
  });

  it('Scenario: Zero and a branch override — 400 too_small minimum 1, 400 setting_scope', async () => {
    const zero = await put(WINDOW, { value: 0 });
    expect(zero.body.errors[0]).toMatchObject({ code: 'too_small', params: { minimum: 1 } });
    const branch = await put(MIN, { value: 4, branch_id: branches.B3 });
    expect([branch.status, branch.body.code]).toStrictEqual([400, 'setting_scope']);
  });

  it('Scenario: No maximum — a window of 50 is stored (owner CM3)', async () => {
    const res = await put(WINDOW, { value: 50 });
    expect(res.status).toBe(200);
    expect(await put(WINDOW, { value: 5 })).toMatchObject({ status: 200 });
  });

  it('Scenario: A minimum within the window — 200 and the next detail reads it (Ko Aung with 2 of the last 5)', async () => {
    await customerHistory(s.prisma);
    expect(await preferred()).toBeUndefined();
    const res = await put(MIN, { value: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ effective: 2 });
    expect(await preferred()).toBe(FIXTURE_IDS.employees.E004);
  });
});
