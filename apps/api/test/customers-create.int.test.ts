import { CustomerStatus, customerSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { Customers } from '../src/modules/booking/index.js';
import { customerHistory } from './builders/customers.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-customer-management tasks 3.2, 3.3 (create side) and 3.6 (create side) — customers spec "Staff
// add a customer with a name and a phone" (P3.CUS.03 · API-DATA-06 · API-SHAPE-04 · API-DATA-10), "A
// phone that already belongs to a customer is refused" (D-CUS-02 · F-BK-21) and "Zawgyi text in a
// customer's name or notes is refused" (API-SHAPE-05 · design D4 / D5). Ko Aung adds Ko Phyo on
// 05/Oct/2026 at 9:10 AM; Daw Mya (INACTIVE) and U Ba (archived) are the scenario customers.
const { customers: fixtureCustomers } = FIXTURE_IDS;
const ZAWGYI_NAME = 'ျမန္မာ'; // "Myanmar" typed with a Zawgyi keyboard
const KO_PHYO_PHONE = '09 4500 1122';

let s: SeededApp;
let ids: Awaited<ReturnType<typeof customerHistory>>['customers'];
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T09:10:00+06:30'));
  ids = (await customerHistory(s.prisma, ['DAW_MYA', 'U_BA'])).customers;
  for (const person of ['E001', 'E004'] as const)
    cookies.set(person, (await s.signIn(person)).cookie);
});
afterAll(() => s.close());

const create = (body: object, person: FixturePerson = 'E004') =>
  s.http
    .post('/api/v1/customers')
    .set('Cookie', cookies.get(person) ?? '')
    .send(body);
const count = (where: object) => s.prisma.customers.count({ where });
const refusal = (res: { status: number; body: { code?: string; errors?: unknown[] } }) => ({
  status: res.status,
  code: res.body.code,
  first: res.body.errors?.[0],
});

describe('add-customer-management · customers · Staff add a customer with a name and a phone', () => {
  it('Scenario: A barber adds Ko Phyo — 201, Location, zero statistics', async () => {
    const res = await create({ name: 'Ko Phyo', phone: KO_PHYO_PHONE });
    expect(res.status).toBe(201);
    const made = customerSchema.parse(res.body);
    expect(res.headers.location).toBe(`/api/v1/customers/${made.id}`);
    expect(made).toMatchObject({
      name: 'Ko Phyo',
      phone: KO_PHYO_PHONE,
      phone_normalized: '+95945001122',
      status: CustomerStatus.ACTIVE,
      archived_at: null,
      notes: null,
      upcoming_bookings: [],
      stats: {
        visit_count: 0,
        total_spent_amount: 0,
        last_visit_at: null,
        no_show_count: 0,
        cancelled_count: 0,
        preferred_employee: null,
        scope_note: 'read_scope',
      },
    });
    expect(made.updated_at).toMatch(/^2026-10-05T09:10:00\.000\+06:30$/);
  });

  it('Scenario: Myanmar digits are stored as 0–9', async () => {
    const res = await create({ name: 'Ko Thiha', phone: '၀၉ ၄၅၀၀ ၁၁၃၃', notes: ' VIP ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      phone: '09 4500 1133',
      phone_normalized: '+95945001133',
      notes: 'VIP',
    });
  });

  it('Scenario: Name and notes at their limits — 255 and 2,000 are created, 256 and 2,001 refused', async () => {
    expect((await create({ name: 'n'.repeat(255), phone: '09 4500 2001' })).status).toBe(201);
    expect(
      (await create({ name: 'n'.repeat(256), phone: '09 4500 2002' })).body.errors[0],
    ).toStrictEqual({ field: 'name', code: 'too_big', params: { maximum: 255 } });
    expect(
      (await create({ name: 'Ko Notes', phone: '09 4500 2003', notes: 'x'.repeat(2000) })).status,
    ).toBe(201);
    expect(
      (await create({ name: 'Ko Notes', phone: '09 4500 2004', notes: 'x'.repeat(2001) })).body
        .errors[0],
    ).toStrictEqual({ field: 'notes', code: 'too_big', params: { maximum: 2000 } });
    expect(await count({ phone_normalized: { in: ['+95945002002', '+95945002004'] } })).toBe(0);
  });

  it('Scenario: A blank name and a missing phone — 400 naming the member, nothing created', async () => {
    const before = await count({});
    const blank = await create({ name: '   ', phone: '09 4500 3001' });
    expect(refusal(blank)).toMatchObject({ status: 400, code: 'validation' });
    expect(blank.body.errors[0]).toMatchObject({
      field: 'name',
      code: 'too_small',
      params: { minimum: 1 },
    });
    const missing = await create({ name: 'Ko Phyo' });
    expect(missing.body.errors[0]).toMatchObject({ field: 'phone', code: 'invalid_type' });
    expect(await count({})).toBe(before);
  });

  it('Scenario: Not a phone number — 400 phone_invalid, nothing created', async () => {
    const before = await count({});
    const res = await create({ name: 'Ko Phyo', phone: '12' });
    expect(refusal(res)).toMatchObject({ status: 400, code: 'phone_invalid' });
    expect(await count({})).toBe(before);
  });
});

describe('add-customer-management · customers · A phone that already belongs to a customer is refused', () => {
  it('Scenario: The number of an active customer in another format — Ma Su', async () => {
    const res = await create({ name: 'Su Su', phone: '+95977123456' });
    expect([res.status, res.body.code]).toStrictEqual([409, 'already_exists']);
    expect(res.body.context).toStrictEqual({
      customer_id: fixtureCustomers.MA_SU,
      status: CustomerStatus.ACTIVE,
      archived: false,
    });
    expect(await count({ phone_normalized: '+95977123456' })).toBe(1);
  });

  it('Scenario: The number of an inactive customer — Daw Mya', async () => {
    const res = await create({ name: 'Daw Hla', phone: '09 2500 3344' });
    expect([res.status, res.body.code]).toStrictEqual([409, 'already_exists']);
    expect(res.body.context).toStrictEqual({
      customer_id: ids.DAW_MYA,
      status: CustomerStatus.INACTIVE,
      archived: false,
    });
  });

  it('Scenario: The number of an archived customer — U Ba', async () => {
    const res = await create({ name: 'U Hla', phone: '09 2600 5566' });
    expect([res.status, res.body.code]).toStrictEqual([409, 'already_exists']);
    expect(res.body.context).toStrictEqual({
      customer_id: ids.U_BA,
      status: CustomerStatus.ACTIVE,
      archived: true,
    });
  });
});

describe("add-customer-management · customers · Zawgyi text in a customer's name or notes is refused", () => {
  it('Scenario: A name typed in Zawgyi — 400 zawgyi_text on name, nothing stored', async () => {
    const res = await create({ name: ZAWGYI_NAME, phone: '09 2700 7788' });
    expect(refusal(res)).toStrictEqual({
      status: 400,
      code: 'zawgyi_text',
      first: { field: 'name', code: 'zawgyi_text' },
    });
    expect(await count({ phone_normalized: '+95927007788' })).toBe(0);
  });

  it('Scenario: Name and notes both in Zawgyi — each member is listed', async () => {
    const res = await create({ name: ZAWGYI_NAME, phone: '09 2700 7788', notes: ZAWGYI_NAME });
    expect(res.body.errors).toStrictEqual([
      { field: 'name', code: 'zawgyi_text' },
      { field: 'notes', code: 'zawgyi_text' },
    ]);
  });

  it('Scenario: The same name in Unicode — 201 and stored as sent', async () => {
    const res = await create({ name: 'မသီရိ', phone: '09 2700 7788' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'မသီရိ' });
  });

  it('Scenario: A FINISH with a Zawgyi name still finishes — the walk-in identity function is unchanged', async () => {
    const match = await s.app.get(TransactionRunner).run((tx) =>
      s.app.get(Customers).matchOrCreate(tx, {
        phone: '09 2800 9900',
        name: ZAWGYI_NAME,
        actor_user_id: FIXTURE_IDS.users.E004,
      }),
    );
    expect(match.customer.name).toBe(ZAWGYI_NAME);
  });
});
