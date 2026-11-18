import { CustomerStatus, UiLanguage, customerListItemSchema, customerSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type CustomerHistory, addCustomer, customerHistory } from './builders/customers.js';
import { UNKNOWN_ID } from './helpers/branches.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';
import { storeSetting } from './helpers/settings.js';

// add-customer-management tasks 2.2 / 2.4 / 2.11 — customers spec "Every customer endpoint passes
// through any active assignment" (the three reads — P3-RULE-11 · API-PERM-02 / 07 · design D2), R2 (one
// last_visit_at for the lookup, the list and the detail) and "The customer detail is readable, archived
// customers included" with its statistics, preferred barber and upcoming bookings (P3.CUS.04 · D6), on
// Ma Su's history of spec-fixtures §2. The clock is 05/Oct/2026 9:00 AM.
const { branches, employees, users, customers: fixtureCustomers } = FIXTURE_IDS;
const MA_SU = fixtureCustomers.MA_SU;
const MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+06:30$/;

let s: SeededApp;
let history: CustomerHistory;
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T09:00:00+06:30'));
  history = await customerHistory(s.prisma);
  for (const person of ['E001', 'E002', 'E004', 'E006'] as const) {
    cookies.set(person, (await s.signIn(person)).cookie);
  }
  await language('E002', UiLanguage.EN);
});
afterAll(() => s.close());

const language = (person: FixturePerson, ui_language: UiLanguage) =>
  s.prisma.users.update({ where: { id: users[person] }, data: { ui_language } });
const get = (person: FixturePerson | null, path: string) => {
  const request = s.http.get(`/api/v1/customers${path}`);
  return person === null ? request : request.set('Cookie', cookies.get(person) ?? '');
};
async function detail(person: FixturePerson, id: string) {
  const res = await get(person, `/${id}`);
  expect(res.status).toBe(200);
  return customerSchema.parse(res.body);
}

describe('add-customer-management · customers · Every customer endpoint passes through any active assignment', () => {
  it('Scenario: A barber of another branch opens a B3 customer — Ko Htet reads Ma Su', async () => {
    expect((await detail('E006', MA_SU)).name).toBe('Ma Su');
    expect((await get('E006', '')).status).toBe(200);
    expect((await get('E006', `/${MA_SU}/timeline`)).status).toBe(200);
  });

  it('Scenario: Signed out — 401 unauthenticated on the three reads', async () => {
    for (const path of ['', `/${MA_SU}`, `/${MA_SU}/timeline`]) {
      const res = await get(null, path);
      expect([res.status, res.body.code]).toStrictEqual([401, 'unauthenticated']);
    }
  });
});

describe('add-customer-management · customers · R2 — one last visit for the lookup, the list and the detail', () => {
  it('Ma Hnin and U Kyaw Zin read the same last_visit_at in all three', async () => {
    for (const [person, expected] of [
      ['E002', '2026-09-28T10:42:00+06:30'],
      ['E001', '2026-10-03T10:42:00+06:30'],
    ] as const) {
      const lookup = await get(person, '/lookup?phone=09%207712%203456');
      const list = await get(person, '?q=su');
      const item = customerListItemSchema.parse(list.body.items[0]);
      const read = await detail(person, MA_SU);
      expect([
        lookup.body.customer.last_visit_at,
        item.last_visit_at,
        read.last_visit_at,
        read.stats.last_visit_at,
      ]).toStrictEqual([expected, expected, expected, expected]);
    }
  });
});

describe('add-customer-management · customers · The customer detail is readable, archived customers included', () => {
  it('Scenario: A manager reads Ma Su — her B3 figures, Ko Aung preferred, "read_scope"', async () => {
    const read = await detail('E002', MA_SU);
    expect(read).toMatchObject({
      id: MA_SU,
      name: 'Ma Su',
      phone: '09 7712 3456',
      phone_normalized: '+95977123456',
      status: CustomerStatus.ACTIVE,
      archived_at: null,
      notes: null,
      visit_count: 6,
      last_visit_at: '2026-09-28T10:42:00+06:30',
      stats: {
        visit_count: 6,
        total_spent_amount: 59_000,
        last_visit_at: '2026-09-28T10:42:00+06:30',
        no_show_count: 2,
        cancelled_count: 3,
        preferred_employee: { id: employees.E004, display_name: 'Ko Aung' },
        scope_note: 'read_scope',
      },
      upcoming_bookings: [
        {
          id: history.upcoming.B3,
          starts_at: '2026-10-12T14:00:00+06:30',
          branch_id: branches.B3,
          booked_employee_id: employees.E004,
        },
      ],
    });
    expect(read.updated_at).toMatch(MILLIS);
  });

  it('Scenario: The company admin — every branch, "company", nobody reaches 3 of the last 5', async () => {
    const read = await detail('E001', MA_SU);
    expect(read.stats).toStrictEqual({
      visit_count: 7,
      total_spent_amount: 65_000,
      last_visit_at: '2026-10-03T10:42:00+06:30',
      no_show_count: 2,
      cancelled_count: 3,
      preferred_employee: null,
      scope_note: 'company',
    });
    expect(read.upcoming_bookings.map((booking) => booking.id)).toStrictEqual([
      history.upcoming.B1,
      history.upcoming.B3,
    ]);
  });

  it('Scenario: Fewer visits than needed — Ko Htet reads his one B1 visit and no B3 booking', async () => {
    const read = await detail('E006', MA_SU);
    expect(read.stats).toStrictEqual({
      visit_count: 1,
      total_spent_amount: 6_000,
      last_visit_at: '2026-10-03T10:42:00+06:30',
      no_show_count: 0,
      cancelled_count: 0,
      preferred_employee: null,
      scope_note: 'read_scope',
    });
    expect(read.upcoming_bookings.map((booking) => booking.id)).toStrictEqual([
      history.upcoming.B1,
    ]);
  });

  it('Scenario: The name follows the caller’s language — ကိုအောင် in Myanmar', async () => {
    await language('E002', UiLanguage.MY);
    expect((await detail('E002', MA_SU)).stats.preferred_employee?.display_name).toBe('ကိုအောင်');
    await language('E002', UiLanguage.EN);
  });

  it('Scenario: An archived customer is still readable — U Ba', async () => {
    const read = await detail('E002', history.customers.U_BA ?? '');
    expect([read.name, read.archived_at, read.status]).toStrictEqual([
      'U Ba',
      '2026-10-01T09:00:00+06:30',
      CustomerStatus.ACTIVE,
    ]);
  });

  it('Scenario: An unknown id — 404 not_found (and an id that is no uuid)', async () => {
    for (const id of [UNKNOWN_ID, 'lookup-x']) {
      const res = await get('E002', `/${id}`);
      expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
    }
  });

  it('a new customer has zero statistics and no upcoming booking', async () => {
    const koPhyo = await addCustomer(s.prisma, 'KO_PHYO');
    const read = await detail('E004', koPhyo);
    expect([read.stats, read.upcoming_bookings, read.visit_count]).toStrictEqual([
      {
        visit_count: 0,
        total_spent_amount: 0,
        last_visit_at: null,
        no_show_count: 0,
        cancelled_count: 0,
        preferred_employee: null,
        scope_note: 'read_scope',
      },
      [],
      0,
    ]);
  });

  it('Scenario: Two qualify — with a minimum of 2 the more recent wins (Ko Aung, 28/Sep)', async () => {
    await storeSetting(s, 'customer.preferred_barber_min_visits', 2);
    expect((await detail('E001', MA_SU)).stats.preferred_employee).toStrictEqual({
      id: employees.E004,
      display_name: 'ကိုအောင်', // U Kyaw Zin's language is the company default, Myanmar
    });
    await storeSetting(s, 'customer.preferred_barber_min_visits', 3);
  });
});

describe('add-customer-management · customers · a role without any customer code (runs last — it changes the seed role)', () => {
  it('Scenario: A role without any customer code — 403 forbidden, context.required = customer.view', async () => {
    const codes = await s.prisma.permissions.findMany({
      where: { code: { startsWith: 'customer.' } },
      select: { id: true },
    });
    const barber = await s.prisma.roles.findFirstOrThrow({
      where: { name_en: 'Barber', archived_at: null },
      select: { id: true },
    });
    await s.prisma.role_permissions.deleteMany({
      where: { role_id: barber.id, permission_id: { in: codes.map((code) => code.id) } },
    });
    for (const path of ['', `/${MA_SU}`, `/${MA_SU}/timeline`]) {
      const res = await get('E004', path);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'customer.view' } });
    }
  });
});
