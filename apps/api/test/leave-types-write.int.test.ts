import { leaveTypeSchema } from '@point/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LT, TRAINING, resetLeaveTypes } from './helpers/leave-types.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-leave-types tasks 2.4 / 2.5 — leave spec "Create a leave type", "… placed last" (LT1), "… names are
// unique among non-archived types", "Edit … with optimistic concurrency" (P2.LVT.02 / 03 · API-IDEM-04 ·
// design D5 – D7). U Kyaw Zin, Monday 05/Oct/2026 from 9:30 AM; each test starts from the fixture types.
const at = (time: string) => new Date(`2026-10-05T${time}+06:30`);
let t: SeededApp;
let cookie = '';

beforeAll(async () => {
  t = await startSeededApp({ now: at('09:30:00') });
  cookie = (await t.signIn('E001')).cookie;
});
beforeEach(async () => {
  t.clock?.set(at('09:30:00'));
  await resetLeaveTypes(t.prisma);
});
afterAll(async () => {
  await t.close();
});

const create = (body: object) =>
  t.http.post('/api/v1/leave-types').set('Cookie', cookie).send(body);
const patch = (id: string, body: object) =>
  t.http.patch(`/api/v1/leave-types/${id}`).set('Cookie', cookie).send(body);
const active = () => t.prisma.leave_types.count({ where: { archived_at: null } });
const auditRowsOf = (res: { headers: Record<string, unknown> }) =>
  t.prisma.audit_events.count({ where: { request_id: res.headers['x-request-id'] as string } });
const archive = (id: string) =>
  t.prisma.leave_types.update({ where: { id }, data: { archived_at: at('09:00:00') } });
const created = async (body: object) => {
  const res = await create(body);
  expect(res.status).toBe(201);
  return leaveTypeSchema.parse(res.body);
};

describe('add-leave-types · leave · Create a leave type', () => {
  it('Scenario: The admin adds Training', async () => {
    const res = await create(TRAINING);
    const training = leaveTypeSchema.parse(res.body);
    expect([res.status, res.headers.location]).toStrictEqual([
      201,
      `/api/v1/leave-types/${training.id}`,
    ]);
    expect(training).toStrictEqual({
      id: training.id,
      ...TRAINING,
      sort_order: 4,
      status: 1,
      archived_at: null,
      updated_at: '2026-10-05T09:30:00.000+06:30',
    });
  });

  it('Scenario: Name limits', async () => {
    // 'က' repeated is read as Zawgyi (the detector), so the 100 characters vary.
    const hundred = `${'ကခဂ'.repeat(33)}က`;
    expect((await create({ name_mm: hundred, is_paid: true })).status).toBe(201);
    const long = await create({ name_mm: `${hundred}ခ`, is_paid: true });
    expect(long.status).toBe(400);
    expect(long.body.errors[0]).toStrictEqual({
      field: 'name_mm',
      code: 'too_big',
      params: { maximum: 100 },
    });
    const blank = await create({ name_mm: '   ', is_paid: true });
    expect(blank.status).toBe(400);
    expect(blank.body.errors[0]).toMatchObject({ code: 'too_small', params: { minimum: 1 } });
  });

  it('Scenario: Paid or unpaid must be given', async () => {
    const res = await create({ name_mm: TRAINING.name_mm });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({ field: 'is_paid', code: 'invalid_type' });
    expect(await active()).toBe(3);
  });

  it('Scenario: A blank English name is stored as null', async () => {
    expect(
      (await created({ name_mm: TRAINING.name_mm, name_en: '  ', is_paid: false })).name_en,
    ).toBeNull();
  });
});

describe('add-leave-types · leave · A new leave type without a position is placed last', () => {
  it('Scenario: Training goes to the end — 3 + 1', async () => {
    const training = await created(TRAINING);
    expect(training.sort_order).toBe(4);
    const list = await t.http.get('/api/v1/leave-types').set('Cookie', cookie);
    expect((list.body as { items: { id: string }[] }).items.at(-1)?.id).toBe(training.id);
  });

  it('Scenario: An archived type does not count — 2 + 1', async () => {
    await archive(LT.UNPAID_LEAVE);
    expect((await created(TRAINING)).sort_order).toBe(3);
  });

  it('Scenario: A sent position is kept', async () => {
    expect((await created({ ...TRAINING, sort_order: 1 })).sort_order).toBe(1);
    const paid = await t.prisma.leave_types.findUniqueOrThrow({ where: { id: LT.PAID_LEAVE } });
    expect(paid.sort_order).toBe(1);
  });

  it('a company with no non-archived type → 1', async () => {
    for (const id of Object.values(LT)) await archive(id);
    expect((await created(TRAINING)).sort_order).toBe(1);
  });
});

describe('add-leave-types · leave · Leave-type names are unique among non-archived types', () => {
  it('Scenario: The Myanmar name is taken', async () => {
    const res = await create({ name_mm: 'ဆေးခွင့်', is_paid: false });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'already_exists' });
    expect(await active()).toBe(3);
  });

  it('Scenario: Renaming onto a taken name', async () => {
    const training = await created(TRAINING);
    const res = await patch(training.id, {
      name_mm: 'ဆေးခွင့်',
      expected_updated_at: training.updated_at,
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'already_exists' });
    const stored = await t.prisma.leave_types.findUniqueOrThrow({ where: { id: training.id } });
    expect(stored.name_mm).toBe(TRAINING.name_mm);
  });

  it('Scenario: The name of an archived type is reused', async () => {
    await archive(LT.UNPAID_LEAVE);
    expect((await create({ name_mm: 'လစာမဲ့ခွင့်', is_paid: false })).status).toBe(201);
  });
});

describe('add-leave-types · leave · Edit a leave type with optimistic concurrency', () => {
  it('Scenario: Rename the English name · A stale edit · Without the expected time · Nothing changes', async () => {
    const training = await created(TRAINING);
    t.clock?.set(at('09:45:00'));
    const renamed = await patch(training.id, {
      name_en: 'Training course',
      expected_updated_at: '2026-10-05T09:30:00.000+06:30',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({
      name_en: 'Training course',
      name_mm: TRAINING.name_mm,
      updated_at: '2026-10-05T09:45:00.000+06:30',
    });

    const stale = await patch(training.id, {
      is_paid: false,
      expected_updated_at: '2026-10-05T09:30:00.000+06:30',
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'conflict' });

    const missing = await patch(training.id, { is_paid: false });
    expect(missing.status).toBe(400);
    expect(missing.body.errors[0]).toMatchObject({
      field: 'expected_updated_at',
      code: 'invalid_type',
    });

    t.clock?.set(at('09:50:00'));
    const same = await patch(training.id, {
      is_paid: true,
      expected_updated_at: '2026-10-05T09:45:00.000+06:30',
    });
    expect(same.status).toBe(200);
    expect(same.body).toMatchObject({ is_paid: true, updated_at: '2026-10-05T09:45:00.000+06:30' });
    expect(await auditRowsOf(same)).toBe(0);
  });

  it('Scenario: An archived type — 404, as an unknown id', async () => {
    const training = await created(TRAINING);
    await archive(training.id);
    const body = { name_en: 'Course', expected_updated_at: training.updated_at };
    for (const id of [training.id, '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70']) {
      const res = await patch(id, body);
      expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
    }
  });
});
