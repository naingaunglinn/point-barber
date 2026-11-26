import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { CustomerStatus, customerSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addCustomer, customerHistory } from './builders/customers.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-customer-management tasks 3.1, 3.3 (edit side), 3.4, 3.5 and 3.6 (update side) — customers spec
// "Every customer endpoint passes through any active assignment" (the write routes — P3-RULE-11 ·
// API-PERM-02 · design D2), "Staff with `customer.update` correct a customer's name, phone and notes"
// (P3.CUS.05 · D5 · D7), "A phone that already belongs to a customer is refused" (the edit and the
// concurrent FINISH), "A stale edit is refused" (API-IDEM-04 · D8) and "Zawgyi text … is refused".
// The clock is 05/Oct/2026 9:10 AM; Ma Su is the seeded customer, Ko Phyo is added by the test.
const { customers: fixtureCustomers } = FIXTURE_IDS;
const MA_SU = fixtureCustomers.MA_SU;
const ZAWGYI_NAME = 'ျမန္မာ';

let s: SeededApp;
let koPhyo: string;
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T09:10:00+06:30'));
  await customerHistory(s.prisma, ['DAW_MYA', 'U_BA']);
  koPhyo = await addCustomer(s.prisma, 'KO_PHYO');
  for (const person of ['E001', 'E002', 'E003', 'E004'] as const) {
    cookies.set(person, (await s.signIn(person)).cookie);
  }
});
afterAll(() => s.close());

const cookie = (person: FixturePerson) => cookies.get(person) ?? '';
const read = async (id: string, person: FixturePerson = 'E002') => {
  const res = await s.http.get(`/api/v1/customers/${id}`).set('Cookie', cookie(person));
  expect(res.status).toBe(200);
  return customerSchema.parse(res.body);
};
/** PATCH with the stored `updated_at` unless the body sends its own. */
async function patch(id: string, body: object, person: FixturePerson = 'E002') {
  const stamp = (await read(id)).updated_at;
  return s.http
    .patch(`/api/v1/customers/${id}`)
    .set('Cookie', cookie(person))
    .send({ expected_updated_at: stamp, ...body });
}
const post = (path: string, body: object, person: FixturePerson) =>
  s.http.post(`/api/v1/customers/${path}`).set('Cookie', cookie(person)).send(body);
const lookup = (phone: string) =>
  s.http.get('/api/v1/customers/lookup').query({ phone }).set('Cookie', cookie('E004'));
const forbidden = (res: { status: number; body: { code?: string; context?: unknown } }) => [
  res.status,
  res.body.code,
  res.body.context,
];

describe('add-customer-management · customers · The write routes pass through any active assignment', () => {
  it('Scenario: A manager without customer.delete — Ma Hnin is refused archive, status and restore', async () => {
    for (const path of ['archive', 'status', 'restore']) {
      const res = await post(`${MA_SU}/${path}`, { status: 0 }, 'E002');
      expect(forbidden(res)).toStrictEqual([403, 'forbidden', { required: 'customer.delete' }]);
    }
    expect((await read(MA_SU)).archived_at).toBeNull();
  });

  it('Scenario: A barber cannot edit — Ko Aung is refused with customer.update, nothing changed', async () => {
    const before = await read(MA_SU);
    const res = await s.http
      .patch(`/api/v1/customers/${MA_SU}`)
      .set('Cookie', cookie('E004'))
      .send({ notes: 'VIP', expected_updated_at: before.updated_at });
    expect(forbidden(res)).toStrictEqual([403, 'forbidden', { required: 'customer.update' }]);
    expect(await read(MA_SU)).toStrictEqual(before);
  });

  it("Scenario: A B1 manager edits the one company-wide row — Ko Zaw sets Ma Su's notes", async () => {
    const res = await patch(MA_SU, { notes: 'Prefers a short fade' }, 'E003');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ notes: 'Prefers a short fade' });
    expect((await read(MA_SU, 'E001')).notes).toBe('Prefers a short fade');
    // Notes are read by every staff member (D-CUS-01): Ko Aung's lookup returns them.
    expect((await lookup('09 7712 3456')).body.customer).toMatchObject({
      notes: 'Prefers a short fade',
    });
  });

  it('Scenario: Signed out — 401 on the create', async () => {
    const res = await s.http.post('/api/v1/customers').send({ name: 'A', phone: '09 4500 9999' });
    expect([res.status, res.body.code]).toStrictEqual([401, 'unauthenticated']);
  });
});

describe('add-customer-management · customers · Staff with customer.update correct a customer', () => {
  it('Scenario: The name cannot be removed — name null is invalid_type', async () => {
    const res = await patch(MA_SU, { name: null });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({ field: 'name', code: 'invalid_type' });
    expect((await read(MA_SU)).name).toBe('Ma Su');
  });

  it('Scenario: Notes cleared — null clears, blank clears', async () => {
    expect((await patch(MA_SU, { notes: null })).body).toMatchObject({ notes: null });
    expect((await patch(MA_SU, { notes: 'VIP' })).body).toMatchObject({ notes: 'VIP' });
    expect((await patch(MA_SU, { notes: '   ' })).body).toMatchObject({ notes: null });
  });

  it('Scenario: Without the edit stamp — 400 on expected_updated_at, nothing changed', async () => {
    const before = await read(MA_SU);
    const res = await s.http
      .patch(`/api/v1/customers/${MA_SU}`)
      .set('Cookie', cookie('E002'))
      .send({ notes: 'Without the stamp' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({
      field: 'expected_updated_at',
      code: 'invalid_type',
    });
    expect(await read(MA_SU)).toStrictEqual(before);
  });

  it('Scenario: Nothing changed — the same notes answer 200 with the same updated_at', async () => {
    const before = await read(MA_SU);
    s.clock?.set(new Date('2026-10-05T09:11:00+06:30'));
    const res = await patch(MA_SU, { notes: before.notes, name: before.name });
    expect(res.status).toBe(200);
    expect(res.body.updated_at).toBe(before.updated_at);
    s.clock?.set(new Date('2026-10-05T09:10:00+06:30'));
  });

  it('Scenario: An edit to a number that is taken — 409 already_exists with Ma Su, Ko Phyo unchanged', async () => {
    const res = await patch(koPhyo, { phone: '09 7712 3456' });
    expect([res.status, res.body.code]).toStrictEqual([409, 'already_exists']);
    expect(res.body.context).toStrictEqual({
      customer_id: MA_SU,
      status: CustomerStatus.ACTIVE,
      archived: false,
    });
    expect((await read(koPhyo)).phone).toBe('09 4500 1122');
  });

  it('Scenario: A concurrent FINISH takes the new number first — 409 with the holder, never 500', async () => {
    const holder = randomUUID();
    const company = await s.prisma.companies.findFirstOrThrow({ select: { id: true } });
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted = (): void => undefined;
    const ready = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    // The FINISH's transaction has inserted the number and not yet committed.
    const finish = s.prisma.$transaction(
      async (db) => {
        await db.customers.create({
          data: {
            id: holder,
            company_id: company.id,
            name: 'Ko Racer',
            phone: '09 4500 7777',
            phone_normalized: '+95945007777',
          },
        });
        inserted();
        await held;
      },
      { timeout: 20_000 },
    );
    await ready;
    const stamp = (await read(koPhyo)).updated_at;
    const pending = Promise.resolve(
      s.http
        .patch(`/api/v1/customers/${koPhyo}`)
        .set('Cookie', cookie('E002'))
        .send({ phone: '09 4500 7777', expected_updated_at: stamp }),
    );
    await sleep(500);
    release();
    await finish;
    const res = await pending;
    expect([res.status, res.body.code]).toStrictEqual([409, 'already_exists']);
    expect(res.body.context).toStrictEqual({
      customer_id: holder,
      status: CustomerStatus.ACTIVE,
      archived: false,
    });
    expect((await read(koPhyo)).phone).toBe('09 4500 1122');
  });

  it('Scenario: A corrected phone — the old number no longer finds her', async () => {
    const res = await patch(MA_SU, { phone: '09 7712 3457' }, 'E003');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: '09 7712 3457', phone_normalized: '+95977123457' });
    expect((await lookup('09 7712 3456')).body).toStrictEqual({ customer: null });
    expect((await lookup('09 7712 3457')).body.customer).toMatchObject({ name: 'Ma Su' });
  });
});

describe('add-customer-management · customers · A stale edit is refused', () => {
  it('Scenario: Laptop and phone edit the same customer — T1 is refused after T2, the current stamp is accepted', async () => {
    const t1 = (await read(koPhyo)).updated_at;
    s.clock?.set(new Date('2026-10-05T10:00:00.250+06:30'));
    const phone = await s.http
      .patch(`/api/v1/customers/${koPhyo}`)
      .set('Cookie', cookie('E003'))
      .send({ notes: 'From the phone', expected_updated_at: t1 });
    expect(phone.status).toBe(200);
    const t2 = customerSchema.parse(phone.body).updated_at;
    expect(t2).toBe('2026-10-05T10:00:00.250+06:30');
    const laptop = await s.http
      .patch(`/api/v1/customers/${koPhyo}`)
      .set('Cookie', cookie('E002'))
      .send({ name: 'Ko Phyo Phyo', expected_updated_at: t1 });
    expect([laptop.status, laptop.body.code]).toStrictEqual([409, 'conflict']);
    expect(laptop.body.context).toBeUndefined();
    expect((await read(koPhyo)).name).toBe('Ko Phyo');
    const retry = await s.http
      .patch(`/api/v1/customers/${koPhyo}`)
      .set('Cookie', cookie('E002'))
      .send({ name: 'Ko Phyo Phyo', expected_updated_at: t2 });
    expect(retry.status).toBe(200);
    // One millisecond away is stale: the compare is to the millisecond.
    const off = await s.http
      .patch(`/api/v1/customers/${koPhyo}`)
      .set('Cookie', cookie('E002'))
      .send({ name: 'Ko Phyo', expected_updated_at: t2.replace('.250', '.251') });
    expect(off.status).toBe(409);
  });
});

describe("add-customer-management · customers · Zawgyi text in a customer's name or notes is refused (update)", () => {
  it('Scenario: A name or notes typed in Zawgyi — 400 zawgyi_text, nothing stored; Unicode is stored', async () => {
    const before = await read(koPhyo);
    const res = await patch(koPhyo, { name: ZAWGYI_NAME, notes: ZAWGYI_NAME });
    expect([res.status, res.body.code]).toStrictEqual([400, 'zawgyi_text']);
    expect(res.body.errors).toStrictEqual([
      { field: 'name', code: 'zawgyi_text' },
      { field: 'notes', code: 'zawgyi_text' },
    ]);
    expect(await read(koPhyo)).toStrictEqual(before);
    expect((await patch(koPhyo, { name: 'မသီရိ' })).body).toMatchObject({ name: 'မသီရိ' });
  });
});
