import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BookingStatus } from '@point/shared';

import { bookingAt } from './builders/bookings.js';
import { addCustomer, mmt } from './builders/customers.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-customer-management task 3.11 — customers spec "Every committed customer write leaves one audit
// row without a branch" (P3-RULE-13 · API-AUD-01 · D-AUD-01 · design D7): the six actions with
// `branch_id = null`, the phone diff, and no row for a 409 or an unchanged PATCH. Monday 05/Oct/2026.
const { customers: fixtureCustomers, users, branches } = FIXTURE_IDS;
const MA_SU = fixtureCustomers.MA_SU;

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T09:30:00+06:30'));
  for (const person of ['E001', 'E003', 'E004'] as const) {
    cookies.set(person, (await s.signIn(person)).cookie);
  }
});
afterAll(() => s.close());

const as = (person: FixturePerson) => cookies.get(person) ?? '';
const rowsOf = (res: { headers: Record<string, unknown> }) =>
  s.prisma.audit_events.findMany({
    where: { request_id: res.headers['x-request-id'] as string },
  });
const stamp = async (id: string) =>
  (await s.http.get(`/api/v1/customers/${id}`).set('Cookie', as('E001'))).body.updated_at as string;

describe('add-customer-management · customers · Every committed customer write leaves one audit row without a branch', () => {
  let koPhyo = '';

  it('Scenario: Create — customer.create with the stored members and no branch', async () => {
    const res = await s.http
      .post('/api/v1/customers')
      .set('Cookie', as('E004'))
      .send({ name: 'Ko Phyo', phone: '09 4500 1122' });
    expect(res.status).toBe(201);
    koPhyo = res.body.id;
    const rows = await rowsOf(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 1,
      action: 'customer.create',
      entity_type: 'customers',
      entity_id: koPhyo,
      branch_id: null,
      actor_user_id: users.E004,
      before_data: null,
      after_data: {
        name: 'Ko Phyo',
        phone: '09 4500 1122',
        phone_normalized: '+95945001122',
        notes: null,
        status: 1,
      },
    });
  });

  it('Scenario: A phone correction — customer.update holds the phone and its E.164 form, before and after', async () => {
    const res = await s.http
      .patch(`/api/v1/customers/${MA_SU}`)
      .set('Cookie', as('E003'))
      .send({ phone: '09 7712 3457', expected_updated_at: await stamp(MA_SU) });
    expect(res.status).toBe(200);
    const rows = await rowsOf(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'customer.update',
      entity_id: MA_SU,
      branch_id: null,
      actor_user_id: users.E003,
      before_data: { phone: '09 7712 3456', phone_normalized: '+95977123456' },
      after_data: { phone: '09 7712 3457', phone_normalized: '+95977123457' },
    });
  });

  it('Scenario: The same number typed another way — only phone changes, carried with its E.164 form', async () => {
    const res = await s.http
      .patch(`/api/v1/customers/${MA_SU}`)
      .set('Cookie', as('E003'))
      .send({ phone: '+95 9 7712 3457', expected_updated_at: await stamp(MA_SU) });
    const rows = await rowsOf(res);
    expect(rows[0]).toMatchObject({
      before_data: { phone: '09 7712 3457', phone_normalized: '+95977123457' },
      after_data: { phone: '+95 9 7712 3457', phone_normalized: '+95977123457' },
    });
  });

  it('Scenario: Deactivate, reactivate, archive with a note, restore — one row each, no branch', async () => {
    const act = async (action: 'status' | 'archive' | 'restore', body: object = {}) => {
      const res = await s.http
        .post(`/api/v1/customers/${koPhyo}/${action}`)
        .set('Cookie', as('E001'))
        .send(body);
      expect(res.status).toBe(200);
      return rowsOf(res);
    };
    const summary = (rows: Awaited<ReturnType<typeof rowsOf>>) =>
      rows.map((row) => [row.action, row.branch_id, row.reason]);
    expect(summary(await act('status', { status: 0 }))).toStrictEqual([
      ['customer.deactivate', null, null],
    ]);
    expect(summary(await act('status', { status: 1 }))).toStrictEqual([
      ['customer.reactivate', null, null],
    ]);
    const archived = await act('archive', { note: 'Moved away' });
    expect(summary(archived)).toStrictEqual([['customer.archive', null, 'Moved away']]);
    expect(archived[0]).toMatchObject({
      before_data: { archived: false },
      after_data: { archived: true },
    });
    const restored = await act('restore');
    expect(summary(restored)).toStrictEqual([['customer.restore', null, null]]);
    expect(restored[0]).toMatchObject({
      before_data: { status: 1, archived: true },
      after_data: { status: 1, archived: false },
    });
  });

  it('Scenario: Refused and unchanged writes — no audit row for a 409 or for the same notes', async () => {
    await bookingAt(s.prisma, {
      branch: branches.B3,
      status: BookingStatus.BOOKED,
      startsAt: mmt('2026-10-12', '14:00'),
      customer: { id: MA_SU, name: 'Ma Su' },
    });
    const refused = await s.http
      .post(`/api/v1/customers/${MA_SU}/archive`)
      .set('Cookie', as('E001'))
      .send({});
    expect([refused.status, refused.body.code]).toStrictEqual([
      409,
      'customer_has_active_bookings',
    ]);
    expect(await rowsOf(refused)).toHaveLength(0);
    const unchanged = await s.http
      .patch(`/api/v1/customers/${MA_SU}`)
      .set('Cookie', as('E003'))
      .send({ name: 'Ma Su', expected_updated_at: await stamp(MA_SU) });
    expect(unchanged.status).toBe(200);
    expect(await rowsOf(unchanged)).toHaveLength(0);
    const taken = await s.http
      .post('/api/v1/customers')
      .set('Cookie', as('E004'))
      .send({ name: 'Su Su', phone: '+95977123457' });
    expect(taken.status).toBe(409);
    expect(await rowsOf(taken)).toHaveLength(0);
  });
});
