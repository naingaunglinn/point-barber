import { randomUUID } from 'node:crypto';

import { LeaveStatus, LeaveTypeStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { LeaveTypes } from '../src/modules/scheduling/index.js';
import { LT, TRAINING, leaveRow } from './helpers/leave-types.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-leave-types tasks 2.6, 2.8 and 2.9 — leave spec "An inactive leave type is not offered for new
// requests" (P2.LVT.01 / 03 · AD-SET-04), "Zawgyi names are refused" (API-SHAPE-05 · AD-FORM-13 · D4)
// and "A leave type is archived only while no PENDING leave uses it" across two connections: a
// transaction of add-leave-requests holds the type FOR SHARE through LeaveTypes.lockActive (API-IDEM-06
// · design D1 / D5). U Kyaw Zin and Ko Aung on Monday 05/Oct/2026.
// The cases run in file order and share one app: `training` is created by "Unicode is stored as sent"
// and the lock cases use it. Run the file whole, never a single case.
const at = (time: string) => new Date(`2026-10-05T${time}+06:30`);
/** `သင်တန်းခွင့်` typed with a Zawgyi keyboard. */
const ZAWGYI_TRAINING = 'သင္တန္းခြင့္';
let t: SeededApp;
let kyawZin = '';
let aung = '';
let training = '';

beforeAll(async () => {
  t = await startSeededApp({ now: at('10:00:00') });
  const [admin, barber] = await Promise.all([t.signIn('E001'), t.signIn('E004')]);
  kyawZin = admin.cookie;
  aung = barber.cookie;
});
afterAll(async () => {
  await t.close();
});

const typeOf = (id: string) => t.prisma.leave_types.findUniqueOrThrow({ where: { id } });
const setStatus = async (id: string, status: number) => {
  const { updated_at } = await typeOf(id);
  return t.http
    .patch(`/api/v1/leave-types/${id}`)
    .set('Cookie', kyawZin)
    .send({ status, expected_updated_at: updated_at.toISOString() });
};
const offered = async () => {
  const res = await t.http.get('/api/v1/leave-types').set('Cookie', aung);
  return (res.body as { items: { name_en: string }[] }).items.map((item) => item.name_en);
};

describe('add-leave-types · leave · An inactive leave type is not offered for new requests', () => {
  it('Scenario: Sick leave is switched off and on', async () => {
    expect((await setStatus(LT.SICK_LEAVE, 0)).status).toBe(200);
    expect(await offered()).toStrictEqual(['Paid leave', 'Unpaid leave']);
    t.clock?.set(at('10:05:00'));
    expect((await setStatus(LT.SICK_LEAVE, 1)).status).toBe(200);
    expect(await offered()).toStrictEqual(['Paid leave', 'Sick leave', 'Unpaid leave']);
  });

  it('Scenario: A leave keeps its type', async () => {
    const leave = await leaveRow(t.prisma, {
      employee: 'E005',
      typeId: LT.SICK_LEAVE,
      status: LeaveStatus.PENDING,
      start: '2026-10-06',
    });
    expect((await setStatus(LT.SICK_LEAVE, 0)).status).toBe(200);
    expect(await t.prisma.leaves.findUniqueOrThrow({ where: { id: leave } })).toMatchObject({
      leave_type_id: LT.SICK_LEAVE,
      status: LeaveStatus.PENDING,
    });
    expect((await setStatus(LT.SICK_LEAVE, 1)).status).toBe(200);
  });
});

describe('add-leave-types · leave · Zawgyi names are refused', () => {
  it('Scenario: A name typed with a Zawgyi keyboard — 400, no type created', async () => {
    const res = await t.http
      .post('/api/v1/leave-types')
      .set('Cookie', kyawZin)
      .send({ name_mm: ZAWGYI_TRAINING, is_paid: true });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'zawgyi_text',
      errors: [{ field: 'name_mm', code: 'zawgyi_text' }],
    });
    expect(await t.prisma.leave_types.count()).toBe(3);
  });

  it('a Zawgyi English name on an edit → 400 and the row unchanged', async () => {
    const before = await typeOf(LT.PAID_LEAVE);
    const res = await t.http
      .patch(`/api/v1/leave-types/${LT.PAID_LEAVE}`)
      .set('Cookie', kyawZin)
      .send({ name_en: ZAWGYI_TRAINING, expected_updated_at: before.updated_at.toISOString() });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ errors: [{ field: 'name_en', code: 'zawgyi_text' }] });
    expect(await typeOf(LT.PAID_LEAVE)).toStrictEqual(before);
  });

  it('Scenario: Unicode is stored as sent', async () => {
    const res = await t.http.post('/api/v1/leave-types').set('Cookie', kyawZin).send(TRAINING);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name_mm: 'သင်တန်းခွင့်' });
    training = (res.body as { id: string }).id;
  });
});

describe('add-leave-types · leave · LeaveTypes.lockActive and the archive', () => {
  it('an archive waits for a transaction holding the type with a PENDING leave, then answers 409', async () => {
    const held = Promise.withResolvers<void>();
    const locked = Promise.withResolvers<void>();
    const request = t.app.get(TransactionRunner).run(async (tx) => {
      expect(await t.app.get(LeaveTypes).lockActive(tx, training)).toMatchObject({ id: training });
      await tx.leaves.create({
        data: {
          id: randomUUID(),
          employee_id: FIXTURE_IDS.employees.E005,
          leave_type_id: training,
          start_date: new Date('2026-10-07T00:00:00Z'),
          end_date: new Date('2026-10-07T00:00:00Z'),
          status: LeaveStatus.PENDING,
          requested_by_user_id: FIXTURE_IDS.users.E005,
        },
      });
      locked.resolve();
      await held.promise;
    });
    await locked.promise;
    let answered = false;
    const archive = t.http
      .post(`/api/v1/leave-types/${training}/archive`)
      .set('Cookie', kyawZin)
      .then((res) => {
        answered = true;
        return res;
      });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(answered).toBe(false);
    held.resolve();
    await request;
    const res = await archive;
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'leave_type_in_use' });
  });

  it('lockActive answers null for an INACTIVE or archived type and for an unknown id', async () => {
    const lockActive = (id: string) =>
      t.app.get(TransactionRunner).run((tx) => t.app.get(LeaveTypes).lockActive(tx, id));
    await t.prisma.leave_types.update({
      where: { id: training },
      data: { status: LeaveTypeStatus.INACTIVE },
    });
    expect(await lockActive(training)).toBeNull();
    await t.prisma.leave_types.update({
      where: { id: FIXTURE_IDS.leaveTypes.UNPAID_LEAVE },
      data: { archived_at: new Date('2026-10-05T03:30:00Z') },
    });
    expect(await lockActive(FIXTURE_IDS.leaveTypes.UNPAID_LEAVE)).toBeNull();
    expect(await lockActive('0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70')).toBeNull();
    expect(await lockActive(FIXTURE_IDS.leaveTypes.SICK_LEAVE)).toMatchObject({ status: 1 });
  });
});
