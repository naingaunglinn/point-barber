import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addCodeToRole } from './helpers/branches.js';
import { LT, TRAINING } from './helpers/leave-types.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-leave-types task 2.1 — leave spec "Leave-type writes need a company-scope grant" and "Archived
// leave types are listed only for holders of a leave-type code" (API-PERM-03 · API-PERM-07 · ADR-012 ·
// design D2). Monday 05/Oct/2026, 9:30 AM MMT; the Manager role gains the three write codes last.
type Caller = { readonly cookie: string };
let t: SeededApp;
let kyawZin: Caller;
let hnin: Caller;
let aung: Caller;

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T09:30:00+06:30') });
  [kyawZin, hnin, aung] = await Promise.all([t.signIn('E001'), t.signIn('E002'), t.signIn('E004')]);
});
afterAll(async () => {
  await t.close();
});

const list = (query: string, caller?: Caller) => {
  const request = t.http.get(`/api/v1/leave-types${query}`);
  return caller === undefined ? request : request.set('Cookie', caller.cookie);
};
const sick = () => t.prisma.leave_types.findUniqueOrThrow({ where: { id: LT.SICK_LEAVE } });
/** The three writes of the spec with valid bodies, each with the code it needs. */
const writes = async (caller: Caller): Promise<(readonly [string, Test])[]> => {
  const { updated_at: stored } = await sick();
  const body = { is_paid: true, expected_updated_at: stored.toISOString() };
  const requests: [string, Test][] = [
    ['leave_type.create', t.http.post('/api/v1/leave-types').send(TRAINING)],
    ['leave_type.update', t.http.patch(`/api/v1/leave-types/${LT.SICK_LEAVE}`).send(body)],
    ['leave_type.delete', t.http.post(`/api/v1/leave-types/${LT.SICK_LEAVE}/archive`)],
  ];
  return requests.map(([code, request]) => [code, request.set('Cookie', caller.cookie)] as const);
};
const expectNothingWritten = async (before: object) => {
  expect(await sick()).toStrictEqual(before);
  expect(await t.prisma.leave_types.count()).toBe(3);
  expect(await t.prisma.audit_events.count({ where: { entity_type: 'leave_types' } })).toBe(0);
};

describe('add-leave-types · leave · Leave-type writes need a company-scope grant', () => {
  it('Scenario: A barber without the code — 403 forbidden naming the code; he still lists', async () => {
    const before = await sick();
    for (const [code, request] of await writes(aung)) {
      const res = await request;
      expect(res.status, code).toBe(403);
      expect(res.body, code).toMatchObject({ code: 'forbidden', context: { required: code } });
    }
    await expectNothingWritten(before);
    expect((await list('', aung)).status).toBe(200);
  });

  it('Scenario: A branch Manager given the code — 403 company_scope_required, nothing written', async () => {
    for (const code of ['leave_type.create', 'leave_type.update', 'leave_type.delete'])
      await addCodeToRole(t.prisma, 'Manager', code);
    const before = await sick();
    for (const [code, request] of await writes(hnin)) {
      const res = await request;
      expect(res.status, code).toBe(403);
      expect(res.body, code).toMatchObject({ code: 'company_scope_required' });
    }
    await expectNothingWritten(before);
  });

  it('Scenario: The Admin at company scope — U Kyaw Zin passes', async () => {
    const res = await t.http
      .post('/api/v1/leave-types')
      .set('Cookie', kyawZin.cookie)
      .send(TRAINING);
    expect(res.status).toBe(201);
    expect(await t.prisma.leave_types.count()).toBe(4);
  });
});

describe('add-leave-types · leave · Archived leave types are listed only for holders of a leave-type code', () => {
  it('Scenario: A barber asks for archived rows', async () => {
    const res = await list('?include_archived=true', aung);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'leave_type.view' } });
  });

  it('a holder of any leave_type code may ask — Ma Hnin with the write codes', async () => {
    expect((await list('?include_archived=true', hnin)).status).toBe(200);
  });

  it('signed out → 401 on the list and on every write', async () => {
    for (const request of [
      list(''),
      t.http.post('/api/v1/leave-types').send(TRAINING),
      t.http.post(`/api/v1/leave-types/${LT.SICK_LEAVE}/archive`),
    ]) {
      const res = await request;
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'unauthenticated' });
    }
  });
});
