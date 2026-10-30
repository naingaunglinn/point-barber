import { branchAssignmentSchema, branchSummarySchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-foundation-auth-access tasks 6.1–6.3 — organization spec "The branch list is a reference list
// for every signed-in staff member" and "An employee's branch assignments are read with the employee
// code for an overlapping branch, or by the employee" (P1.BR.01 · P1.EMP.06 · P1-RULE-11 ·
// API-PERM-03 / 04 · design D15). Today is Monday 05/Oct/2026.
const E = FIXTURE_IDS.employees;
const UNKNOWN = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';
const SEVEN = ['code', 'id', 'is_public', 'name_en', 'name_mm', 'phone', 'status'];
let t: SeededApp;
type Caller = { readonly cookie: string };
let kyawZin: Caller;
let hnin: Caller;
let zaw: Caller;
let aung: Caller;

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T04:00:00Z') });
  [kyawZin, hnin, zaw, aung] = await Promise.all([
    t.signIn('E001'),
    t.signIn('E002'),
    t.signIn('E003'),
    t.signIn('E004'),
  ]);
});
afterAll(async () => {
  await t.close();
});

const get = (path: string, caller?: Caller) => {
  const request = t.http.get(`/api/v1/${path}`);
  return caller === undefined ? request : request.set('Cookie', caller.cookie);
};
const branchesOf = (employeeId: string, caller: Caller) =>
  get(`employees/${employeeId}/branches`, caller);
const codes = (body: { items: { branch: { code: string } }[] }) =>
  body.items.map((item) => item.branch.code);

describe('add-foundation-auth-access · organization · The branch list is a reference list for every signed-in staff member', () => {
  it('Scenarios: A barber of one branch sees all three names · no sensitive field is included', async () => {
    const res = await get('branches', aung);
    expect(res.status).toBe(200);
    expect(res.body.items).toMatchObject([
      { code: 'B1', name_en: 'Point 1.0', status: 1 },
      { code: 'B2', name_en: 'Point 2.0', status: 1 },
      { code: 'B3', name_en: 'Point 3.0', status: 1 },
    ]);
    for (const item of res.body.items as Record<string, unknown>[]) {
      expect(Object.keys(item).sort()).toStrictEqual(SEVEN);
      expect(branchSummarySchema.safeParse(item).success).toBe(true);
    }
  });

  it('Scenario: Status filter', async () => {
    const res = await get('branches?status=0', aung);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ items: [] });
    expect((await get('branches?status=1', aung)).body.items).toHaveLength(3);
  });

  it('Scenario: Unknown status value', async () => {
    const res = await get('branches?status=2', aung);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', errors: [{ field: 'status' }] });
  });

  it('Scenario: Signed out', async () => {
    const res = await get('branches');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'unauthenticated' });
  });
});

describe("add-foundation-auth-access · organization · An employee's branch assignments are read with the employee code for an overlapping branch, or by the employee", () => {
  it('Scenario: A manager reads a barber of her branch', async () => {
    const res = await branchesOf(E.E004, hnin);
    expect(res.status).toBe(200);
    expect(res.body.items).toMatchObject([
      { branch: { code: 'B3' }, effective_from: '2026-09-01', effective_to: null },
    ]);
    for (const item of res.body.items as unknown[]) {
      expect(branchAssignmentSchema.safeParse(item).success).toBe(true);
    }
  });

  it('Scenario: A manager cannot see an employee of another branch', async () => {
    const outside = await branchesOf(E.E006, hnin);
    expect(outside.status).toBe(404);
    expect(outside.body).toMatchObject({ code: 'not_found' });
    const unknown = await branchesOf(UNKNOWN, hnin);
    expect(unknown.status).toBe(404);
    expect(Object.keys(outside.body).sort()).toStrictEqual(Object.keys(unknown.body).sort());
  });

  it('Scenario: One overlapping branch is enough', async () => {
    const res = await branchesOf(E.E001, hnin);
    expect(res.status).toBe(200);
    expect(codes(res.body)).toStrictEqual(['B1', 'B2', 'B3']);
  });

  it('Scenario: A barber reads his own assignments', async () => {
    const res = await branchesOf(E.E004, aung);
    expect(res.status).toBe(200);
    expect(codes(res.body)).toStrictEqual(['B3']);
  });

  it("Scenario: A barber cannot read a colleague's assignments", async () => {
    const res = await branchesOf(E.E005, aung);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'employee.view' } });
  });

  it('Scenario: History of a deactivated employee is visible at company scope only', async () => {
    const admin = await branchesOf(E.E009, kyawZin);
    expect(admin.status).toBe(200);
    expect(admin.body.items).toMatchObject([
      { branch: { code: 'B3' }, effective_from: '2026-09-01', effective_to: '2026-09-30' },
    ]);
    const manager = await branchesOf(E.E009, hnin);
    expect(manager.status).toBe(404);
    expect(manager.body).toMatchObject({ code: 'not_found' });
  });

  it('Scenario: The other branch manager', async () => {
    const htet = await branchesOf(E.E006, zaw);
    expect(htet.status).toBe(200);
    expect(codes(htet.body)).toStrictEqual(['B1']);
    const other = await branchesOf(E.E004, zaw);
    expect(other.status).toBe(404);
    expect(other.body).toMatchObject({ code: 'not_found' });
  });

  it('an id that is not a UUID is not found for a holder, forbidden for a barber', async () => {
    expect((await branchesOf('not-a-uuid', hnin)).status).toBe(404);
    expect((await branchesOf('not-a-uuid', aung)).status).toBe(403);
  });

  it('Scenario: Reading is not audited', async () => {
    const res = await get('branches', aung);
    expect(
      await t.prisma.audit_events.count({
        where: { request_id: res.headers['x-request-id'] as string },
      }),
    ).toBe(0);
  });
});
