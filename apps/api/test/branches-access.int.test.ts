import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { B4, UNKNOWN_ID, addCodeToRole } from './helpers/branches.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-branch-management tasks 2.1 / 2.2 — the access rules of the four branch endpoints: organization
// spec "A branch's detail is read by any signed-in staff member inside their read scope", "A branch is
// created only with branch.create held at company scope", "A branch is updated only with
// branch.update for that branch" and "A branch is deactivated or re-activated only with branch.delete
// held at company scope" (P1.BR.02 – 05 · API-PERM-02 / 03 / 07 · P1-RULE-05 / 13 · ADR-011 #3 ·
// ADR-012 · design D2). Monday 05/Oct/2026 from 9:30 AM MMT. The scenarios that tick a code on the
// seed Manager role run after the ones that need the seed role as it is.
const B = FIXTURE_IDS.branches;
type Caller = { readonly cookie: string };
let t: SeededApp;
let kyawZin: Caller;
let hnin: Caller;
let zaw: Caller;
let aung: Caller;
let htet: Caller;

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T09:30:00+06:30') });
  [kyawZin, hnin, zaw, aung, htet] = await Promise.all([
    t.signIn('E001'),
    t.signIn('E002'),
    t.signIn('E003'),
    t.signIn('E004'),
    t.signIn('E006'),
  ]);
});
afterAll(async () => {
  await t.close();
});

const detail = (id: string, caller?: Caller) => {
  const request = t.http.get(`/api/v1/branches/${id}`);
  return caller === undefined ? request : request.set('Cookie', caller.cookie);
};
const create = (body: object, caller: Caller) =>
  t.http.post('/api/v1/branches').set('Cookie', caller.cookie).send(body);
const patch = (id: string, body: object, caller: Caller) =>
  t.http.patch(`/api/v1/branches/${id}`).set('Cookie', caller.cookie).send(body);
const setStatus = (id: string, body: object, caller: Caller) =>
  t.http.post(`/api/v1/branches/${id}/status`).set('Cookie', caller.cookie).send(body);

const branchCount = () => t.prisma.branches.count();
const auditRowsOf = (res: { headers: Record<string, unknown> }) =>
  t.prisma.audit_events.count({ where: { request_id: res.headers['x-request-id'] as string } });
const b3 = () => t.prisma.branches.findUniqueOrThrow({ where: { id: B.B3 } });

describe("add-branch-management · organization · A branch's detail is read by any signed-in staff member inside their read scope", () => {
  it('Scenario: A barber reads his own branch', async () => {
    const res = await detail(B.B3, aung);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      code: 'B3',
      name_en: 'Point 3.0',
      name_mm: 'ပွိုင့် ၃.၀',
      status: 1,
      is_public: true,
      phone: null,
      location_radius_meters: null,
      active_employees: 5,
    });
  });

  it('Scenario: A barber of another branch gets the not-found answer', async () => {
    const outside = await detail(B.B3, htet);
    expect(outside.status).toBe(404);
    expect(outside.body).toMatchObject({ code: 'not_found' });
    const unknown = await detail(UNKNOWN_ID, htet);
    expect(unknown.status).toBe(404);
    expect(Object.keys(outside.body as object).sort()).toStrictEqual(
      Object.keys(unknown.body as object).sort(),
    );
    expect({ ...outside.body, request_id: null }).toStrictEqual({
      ...unknown.body,
      request_id: null,
    });
  });

  it('Scenario: A manager reads only her branch', async () => {
    expect((await detail(B.B3, hnin)).status).toBe(200);
    const other = await detail(B.B1, hnin);
    expect(other.status).toBe(404);
    expect(other.body).toMatchObject({ code: 'not_found' });
  });

  it('Scenario: The company admin reads every branch', async () => {
    const codes = [];
    for (const id of [B.B1, B.B2, B.B3]) {
      const res = await detail(id, kyawZin);
      expect(res.status).toBe(200);
      codes.push((res.body as { code: string }).code);
    }
    expect(codes).toStrictEqual(['B1', 'B2', 'B3']);
  });

  it('Scenario: Signed out', async () => {
    const res = await detail(B.B3);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'unauthenticated' });
  });

  it('an id that is not a UUID answers the not-found body, also at company scope', async () => {
    for (const caller of [kyawZin, aung]) {
      const res = await detail('not-a-uuid', caller);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'not_found' });
    }
  });

  it('reading is not audited', async () => {
    expect(await auditRowsOf(await detail(B.B3, kyawZin))).toBe(0);
  });
});

describe('add-branch-management · organization · A branch is created only with branch.create held at company scope', () => {
  it('Scenario: A caller without the code', async () => {
    const res = await create(B4, aung);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'branch.create' } });
    expect(await branchCount()).toBe(3);
  });

  it('Scenario: A branch-scope holder of the code', async () => {
    await addCodeToRole(t.prisma, 'Manager', 'branch.create');
    const res = await create(B4, hnin);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'company_scope_required' });
    expect(await branchCount()).toBe(3);
    expect(await auditRowsOf(res)).toBe(0);
  });

  it('Scenario: The admin opens a fourth branch', async () => {
    const res = await create(B4, kyawZin);
    expect(res.status).toBe(201);
    const body = res.body as { id: string };
    expect(res.headers.location).toBe(`/api/v1/branches/${body.id}`);
    expect(res.body).toMatchObject({
      code: 'B4',
      status: 1,
      active_employees: 0,
      created_at: '2026-10-05T09:30:00+06:30',
    });
    const list = await t.http.get('/api/v1/branches').set('Cookie', kyawZin.cookie);
    expect((list.body as { items: { code: string }[] }).items.map((b) => b.code)).toStrictEqual([
      'B1',
      'B2',
      'B3',
      'B4',
    ]);
  });

  it("Scenario: The new branch is in the admin's scope at once", async () => {
    const me = await t.http.get('/api/v1/me').set('Cookie', kyawZin.cookie);
    const inScope = (me.body as { branches_in_scope: { id: string; code: string }[] })
      .branches_in_scope;
    expect(inScope).toHaveLength(4);
    const b4 = inScope.find((branch) => branch.code === 'B4');
    expect(b4).toBeDefined();
    expect((await detail(b4?.id ?? '', kyawZin)).status).toBe(200);
  });
});

describe('add-branch-management · organization · A branch is updated only with branch.update for that branch', () => {
  it('Scenario: The admin edits a branch', async () => {
    t.clock?.set(new Date('2026-10-05T10:00:00+06:30'));
    const res = await patch(B.B3, { phone: '09 7700 0003' }, kyawZin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: '09 7700 0003' });
  });

  it('Scenario: The seed Manager only reads', async () => {
    const before = await b3();
    const res = await patch(B.B3, { phone: '09 7700 0001' }, hnin);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'branch.update' } });
    expect(await b3()).toStrictEqual(before);
    expect(await auditRowsOf(res)).toBe(0);
  });

  it('Scenario: A manager given the code edits her own branch only', async () => {
    await addCodeToRole(t.prisma, 'Manager', 'branch.update');
    const own = await patch(B.B3, { phone: '09 7700 0003' }, hnin);
    expect(own.status).toBe(200);
    const other = await patch(B.B3, { phone: '09 7700 0001' }, zaw);
    expect(other.status).toBe(403);
    expect(other.body).toMatchObject({
      code: 'forbidden',
      context: { required: 'branch.update' },
    });
    expect((await b3()).phone).toBe('09 7700 0003');
  });

  it('a branch-scope holder naming an id that does not exist is refused before any read (403)', async () => {
    const res = await patch(UNKNOWN_ID, { phone: '09 7700 0001' }, zaw);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'branch.update' } });
  });

  it('Scenario: An id that does not exist', async () => {
    const res = await patch(UNKNOWN_ID, { phone: '09 7700 0003' }, kyawZin);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'not_found' });
    expect((await patch('not-a-uuid', { phone: '09 7700 0003' }, kyawZin)).status).toBe(404);
  });
});

describe('add-branch-management · organization · A branch is deactivated or re-activated only with branch.delete held at company scope', () => {
  it('Scenario: A caller without the code', async () => {
    const res = await setStatus(B.B3, { status: 0 }, aung);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'branch.delete' } });
    expect((await b3()).status).toBe(1);
  });

  it('Scenario: A branch-scope holder of the code', async () => {
    await addCodeToRole(t.prisma, 'Manager', 'branch.delete');
    const before = await b3();
    const res = await setStatus(B.B3, { status: 0 }, hnin);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'company_scope_required' });
    expect(await b3()).toStrictEqual(before);
    expect(await auditRowsOf(res)).toBe(0);
  });

  it('an id that does not exist answers 404 not_found at company scope', async () => {
    for (const id of [UNKNOWN_ID, 'not-a-uuid']) {
      const res = await setStatus(id, { status: 0 }, kyawZin);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'not_found' });
    }
  });
});
