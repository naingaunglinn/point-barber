import { randomUUID } from 'node:crypto';

import { leaveTypeSchema } from '@point/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LT, TRAINING } from './helpers/leave-types.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-leave-types task 2.3 — leave spec "Any staff member lists the leave types in their order" and the
// archived rows of "Archived leave types are listed only for holders of a leave-type code" (P2.LVT.01 ·
// P2-RULE-11 · design D8). The fixture types of module 150; Monday 05/Oct/2026.
type Caller = { readonly cookie: string };
let t: SeededApp;
let kyawZin: Caller;
let aung: Caller;

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T09:30:00+06:30') });
  [kyawZin, aung] = await Promise.all([t.signIn('E001'), t.signIn('E004')]);
});
afterAll(async () => {
  await t.close();
});

const list = async (query: string, caller: Caller) => {
  const res = await t.http.get(`/api/v1/leave-types${query}`).set('Cookie', caller.cookie);
  expect(res.status).toBe(200);
  return (res.body as { items: unknown[] }).items.map((item) => leaveTypeSchema.parse(item));
};
const names = async (query: string, caller = aung) =>
  (await list(query, caller)).map((item) => item.name_en);
const setStatus = (id: string, status: number) =>
  t.prisma.leave_types.update({ where: { id }, data: { status } });

describe('add-leave-types · leave · Any staff member lists the leave types in their order', () => {
  it("Scenario: The request form's list", async () => {
    expect(await list('', aung)).toMatchObject([
      { name_en: 'Paid leave', sort_order: 1, is_paid: true, status: 1, archived_at: null },
      { name_en: 'Sick leave', sort_order: 2, is_paid: false, status: 1, archived_at: null },
      { name_en: 'Unpaid leave', sort_order: 3, is_paid: false, status: 1, archived_at: null },
    ]);
  });

  it('Scenario: An inactive type is left out by default', async () => {
    await setStatus(LT.SICK_LEAVE, 0);
    expect(await names('')).toStrictEqual(['Paid leave', 'Unpaid leave']);
    expect(await names('?status=0')).toStrictEqual(['Sick leave']);
    expect(await names('?status=0&status=1')).toStrictEqual([
      'Paid leave',
      'Sick leave',
      'Unpaid leave',
    ]);
    await setStatus(LT.SICK_LEAVE, 1);
  });

  it('Scenario: Equal positions are ordered by the Myanmar name', async () => {
    const { id: company_id } = await t.prisma.companies.findFirstOrThrow();
    const { id: training } = await t.prisma.leave_types.create({
      data: { id: randomUUID(), company_id, ...TRAINING, sort_order: 2 },
    });
    // ဆ (U+1006) sorts before သ (U+101E) in code-point order.
    expect(await names('')).toStrictEqual(['Paid leave', 'Sick leave', 'Training', 'Unpaid leave']);
    await t.prisma.leave_types.update({
      where: { id: training },
      data: { sort_order: 4, archived_at: new Date('2026-10-05T10:00:00+06:30') },
    });
  });

  it('Scenario: Signed out', async () => {
    const res = await t.http.get('/api/v1/leave-types');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'unauthenticated' });
  });
});

describe('add-leave-types · leave · Archived leave types are listed only for holders of a leave-type code', () => {
  it('Scenario: The Admin sees an archived type (Training, archived at 10:00 AM)', async () => {
    const items = await list('?include_archived=true', kyawZin);
    expect(items.map((item) => [item.name_en, item.archived_at])).toStrictEqual([
      ['Paid leave', null],
      ['Sick leave', null],
      ['Unpaid leave', null],
      ['Training', '2026-10-05T10:00:00+06:30'],
    ]);
    expect(await names('', kyawZin)).toStrictEqual(['Paid leave', 'Sick leave', 'Unpaid leave']);
  });
});
