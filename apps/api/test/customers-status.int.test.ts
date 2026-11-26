import { setTimeout as sleep } from 'node:timers/promises';

import { BookingStatus, CustomerStatus, customerSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bookingAt } from './builders/bookings.js';
import { addCustomer, customerHistory, mmt } from './builders/customers.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-customer-management tasks 3.7 – 3.10 — customers spec "`customer.delete` holders set a customer
// Inactive or Active" (P3.CUS.06), "A customer with BOOKED or STARTED bookings is not archived" (P3.CUS.07
// · R1), "Archive hides the customer and keeps the row" (owner CM4), "Restore brings an archived
// customer back as ACTIVE" (P3.CUS.08) and "An archived customer is changed only after a restore"
// (owner CM5 — API-PERM-05). U Kyaw Zin on 01/Oct/2026 at 9:00 AM; Ma Su has her two BOOKED bookings
// (B1 08/Oct, B3 12/Oct) of spec-fixtures §2.
const { branches, customers: fixtureCustomers } = FIXTURE_IDS;
const MA_SU = fixtureCustomers.MA_SU;

let s: SeededApp;
let history: Awaited<ReturnType<typeof customerHistory>>;
let dawMya = '';
let uBa = '';
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-01T09:00:00+06:30'));
  history = await customerHistory(s.prisma, ['DAW_MYA']);
  dawMya = history.customers.DAW_MYA ?? '';
  uBa = await addCustomer(s.prisma, 'U_BA');
  for (const person of ['E001', 'E002', 'E004'] as const) {
    cookies.set(person, (await s.signIn(person)).cookie);
  }
});
afterAll(() => s.close());

const cookie = (person: FixturePerson) => cookies.get(person) ?? '';
const post = (id: string, action: 'status' | 'archive' | 'restore', body: object = {}) =>
  s.http.post(`/api/v1/customers/${id}/${action}`).set('Cookie', cookie('E001')).send(body);
const read = async (id: string) =>
  customerSchema.parse(
    (await s.http.get(`/api/v1/customers/${id}`).set('Cookie', cookie('E002'))).body,
  );
const listed = async (query = '') =>
  (
    (await s.http.get(`/api/v1/customers${query}`).set('Cookie', cookie('E002'))).body as {
      items: { id: string }[];
    }
  ).items.map((item) => item.id);
const audits = (id: string) =>
  s.prisma.audit_events.findMany({
    where: { entity_type: 'customers', entity_id: id },
    orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
  });

describe('add-customer-management · customers · customer.delete holders set a customer Inactive or Active', () => {
  it('Scenario: Ma Su set Inactive and back — hidden from the default list, found by the lookup', async () => {
    const off = await post(MA_SU, 'status', { status: 0 });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ status: CustomerStatus.INACTIVE });
    expect(await listed()).not.toContain(MA_SU);
    const lookup = await s.http
      .get('/api/v1/customers/lookup')
      .query({ phone: '09 7712 3456' })
      .set('Cookie', cookie('E004'));
    expect(lookup.body.customer).toMatchObject({ id: MA_SU, status: CustomerStatus.INACTIVE });
    const on = await post(MA_SU, 'status', { status: 1 });
    expect(on.body).toMatchObject({ status: CustomerStatus.ACTIVE });
    expect(await listed()).toContain(MA_SU);
  });

  it('Scenario: The same status twice — both 200, the same updated_at, one deactivate audit row', async () => {
    s.clock?.set(new Date('2026-10-01T09:06:00+06:30'));
    const twice = await post(MA_SU, 'status', { status: 0 });
    s.clock?.set(new Date('2026-10-01T09:07:00+06:30'));
    const again = await post(MA_SU, 'status', { status: 0 });
    expect([twice.status, again.status]).toStrictEqual([200, 200]);
    expect(again.body.updated_at).toBe(twice.body.updated_at);
    const rows = (await audits(MA_SU)).filter((row) => row.action === 'customer.deactivate');
    expect(rows).toHaveLength(1);
    await post(MA_SU, 'status', { status: 1 });
    s.clock?.set(new Date('2026-10-01T09:00:00+06:30'));
  });

  it('Scenario: An unknown status — 400 on status', async () => {
    const res = await post(MA_SU, 'status', { status: 2 });
    expect([res.status, res.body.code]).toStrictEqual([400, 'validation']);
    expect(res.body.errors[0]).toMatchObject({ field: 'status' });
  });
});

describe('add-customer-management · customers · A customer with BOOKED or STARTED bookings is not archived', () => {
  it('Scenario: Two booked bookings at two branches — 409 with count 2, nothing archived', async () => {
    const res = await post(MA_SU, 'archive');
    expect([res.status, res.body.code]).toStrictEqual([409, 'customer_has_active_bookings']);
    expect(res.body.context).toStrictEqual({ count: 2 });
    expect((await read(MA_SU)).archived_at).toBeNull();
  });

  it('Scenario: A started booking — 409 with count 1', async () => {
    await s.prisma.bookings.update({
      where: { id: history.upcoming.B1 },
      data: { status: BookingStatus.COMPLETED },
    });
    await s.prisma.bookings.update({
      where: { id: history.upcoming.B3 },
      data: { status: BookingStatus.STARTED },
    });
    const res = await post(MA_SU, 'archive');
    expect([res.status, res.body.code]).toStrictEqual([409, 'customer_has_active_bookings']);
    expect(res.body.context).toStrictEqual({ count: 1 });
    expect((await audits(MA_SU)).filter((row) => row.action === 'customer.archive')).toHaveLength(0);
  });

  it('Scenario: Only past bookings — the archive answers 200', async () => {
    await s.prisma.bookings.update({
      where: { id: history.upcoming.B3 },
      data: { status: BookingStatus.COMPLETED },
    });
    const res = await post(MA_SU, 'archive');
    expect(res.status).toBe(200);
    expect(res.body.archived_at).not.toBeNull();
    expect((await post(MA_SU, 'restore')).status).toBe(200);
  });

  it('R1: a booking that commits while the archive waits for the row is counted — 409 with count 1', async () => {
    const customer = await addCustomer(s.prisma, 'KO_PHYO');
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = (): void => undefined;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // The booking pipeline's transaction: it holds the customer row and has an uncommitted BOOKED booking.
    const booking = s.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer}::uuid FOR UPDATE`;
        await bookingAt(tx, {
          branch: branches.B3,
          status: BookingStatus.BOOKED,
          startsAt: mmt('2026-10-08', '15:00'),
          customer: { id: customer, name: 'Ko Phyo' },
        });
        locked();
        await held;
      },
      { timeout: 20_000 },
    );
    await ready;
    const pending = Promise.resolve(post(customer, 'archive'));
    await sleep(500);
    release();
    await booking;
    const res = await pending;
    expect([res.status, res.body.code]).toStrictEqual([409, 'customer_has_active_bookings']);
    expect(res.body.context).toStrictEqual({ count: 1 });
    expect((await read(customer)).archived_at).toBeNull();
  });
});

describe('add-customer-management · customers · Archive hides the customer and keeps the row', () => {
  it('Scenario: The admin archives U Ba — archived_at, status kept, the note as the audit reason', async () => {
    const res = await post(uBa, 'archive', { note: 'Moved away' });
    expect(res.status).toBe(200);
    expect(customerSchema.parse(res.body)).toMatchObject({
      archived_at: '2026-10-01T09:00:00+06:30',
      status: CustomerStatus.ACTIVE,
    });
    const rows = (await audits(uBa)).filter((row) => row.action === 'customer.archive');
    expect(rows.map((row) => row.reason)).toStrictEqual(['Moved away']);
    expect(await listed()).not.toContain(uBa);
  });

  it('Scenario: The note\'s limit — 500 accepted, 501 refused on note', async () => {
    const spare = await addCustomer(s.prisma, 'MA_THIRI');
    const long = await post(spare, 'archive', { note: 'n'.repeat(501) });
    expect(long.status).toBe(400);
    expect(long.body.errors[0]).toStrictEqual({
      field: 'note',
      code: 'too_big',
      params: { maximum: 500 },
    });
    expect((await read(spare)).archived_at).toBeNull();
    expect((await post(spare, 'archive', { note: 'n'.repeat(500) })).status).toBe(200);
  });

  it('Scenario: The phone stays reserved — the lookup says archived, a create is 409 with archived true', async () => {
    const lookup = await s.http
      .get('/api/v1/customers/lookup')
      .query({ phone: '09 2600 5566' })
      .set('Cookie', cookie('E004'));
    expect(lookup.body).toStrictEqual({ customer: null, archived: true });
    const create = await s.http
      .post('/api/v1/customers')
      .set('Cookie', cookie('E004'))
      .send({ name: 'U Hla', phone: '09 2600 5566' });
    expect([create.status, create.body.code]).toStrictEqual([409, 'already_exists']);
    expect(create.body.context).toMatchObject({ customer_id: uBa, archived: true });
  });

  it('Scenario: Archive twice — 200 with the same archived_at and updated_at, one audit row', async () => {
    const before = await read(uBa);
    s.clock?.set(new Date('2026-10-01T09:30:00+06:30'));
    const again = await post(uBa, 'archive', { note: 'Again' });
    expect(again.status).toBe(200);
    expect([again.body.archived_at, again.body.updated_at]).toStrictEqual([
      before.archived_at,
      before.updated_at,
    ]);
    expect((await audits(uBa)).filter((row) => row.action === 'customer.archive')).toHaveLength(1);
    s.clock?.set(new Date('2026-10-01T09:00:00+06:30'));
  });
});

describe('add-customer-management · customers · Restore brings an archived customer back as ACTIVE', () => {
  it('Scenario: U Ba comes back — ACTIVE, not archived, in the default list again', async () => {
    const res = await post(uBa, 'restore');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ archived_at: null, status: CustomerStatus.ACTIVE });
    expect(await listed()).toContain(uBa);
    expect((await audits(uBa)).filter((row) => row.action === 'customer.restore')).toHaveLength(1);
  });

  it('Scenario: An archived inactive customer — Daw Mya is restored with status 1', async () => {
    expect((await post(dawMya, 'status', { status: 0 })).status).toBe(200);
    expect((await post(dawMya, 'archive')).status).toBe(200);
    const res = await post(dawMya, 'restore');
    expect(res.body).toMatchObject({ status: CustomerStatus.ACTIVE, archived_at: null });
  });

  it('Scenario: A customer who is not archived — 200, unchanged, no restore audit row', async () => {
    const before = await read(MA_SU);
    s.clock?.set(new Date('2026-10-01T09:40:00+06:30'));
    const res = await post(MA_SU, 'restore');
    expect(res.status).toBe(200);
    expect(res.body.updated_at).toBe(before.updated_at);
    expect((await audits(MA_SU)).filter((row) => row.action === 'customer.restore')).toHaveLength(1);
    s.clock?.set(new Date('2026-10-01T09:00:00+06:30'));
  });
});

describe('add-customer-management · customers · An archived customer is changed only after a restore', () => {
  it('Scenario: Editing and deactivating an archived customer — 409 invalid_transition, nothing written', async () => {
    expect((await post(uBa, 'archive')).status).toBe(200);
    const before = await read(uBa);
    const edit = await s.http
      .patch(`/api/v1/customers/${uBa}`)
      .set('Cookie', cookie('E002'))
      .send({ notes: 'New notes', expected_updated_at: before.updated_at });
    expect([edit.status, edit.body.code]).toStrictEqual([409, 'invalid_transition']);
    const status = await post(uBa, 'status', { status: 0 });
    expect([status.status, status.body.code]).toStrictEqual([409, 'invalid_transition']);
    expect(await read(uBa)).toStrictEqual(before);
  });
});
