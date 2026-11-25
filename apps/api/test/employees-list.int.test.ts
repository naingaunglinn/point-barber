import { ScopeType } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assignAt, endAssignment } from './helpers/branches.js';
import { assignRole } from './helpers/roles.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';
import { createBranch } from './helpers/people.js';

// add-employee-management task 2.5 — the scope and the items of `GET /v1/employees` (P1.EMP.01):
// organization spec "The employee list is a management read filtered to the caller's branches"
// (API-PERM-02 / 03 · P1-RULE-11 · D-EMP-06 · design D8). Monday 05/Oct/2026 from 9:30 AM MMT.
const B = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
let t: SeededApp;
let kyawZin: { cookie: string };
let hnin: { cookie: string };
let aung: { cookie: string };

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T09:30:00+06:30') });
  [kyawZin, hnin, aung] = await Promise.all([t.signIn('E001'), t.signIn('E002'), t.signIn('E004')]);
});
afterAll(async () => {
  await t.close();
});

const list = (caller?: { cookie: string }, query = '?limit=100') => {
  const request = t.http.get(`/api/v1/employees${query}`);
  return caller === undefined ? request : request.set('Cookie', caller.cookie);
};
type Item = {
  id: string;
  employee_code: string;
  status: number;
  login_status: number;
  branches: { code: string }[];
  roles: { name_en: string | null }[];
};
const itemsOf = (res: { body: unknown }) => (res.body as { items: Item[] }).items;
const codes = (res: { body: unknown }) => itemsOf(res).map((item) => item.employee_code);

describe("add-employee-management · organization · The employee list is a management read filtered to the caller's branches", () => {
  it('Scenario: The admin sees all nine', async () => {
    const res = await list(kyawZin);
    expect(res.status).toBe(200);
    const body = res.body as { total: number; next_cursor: string | null };
    expect(body.total).toBe(9);
    expect(body.next_cursor).toBeNull();
    expect(itemsOf(res)).toHaveLength(9);
    expect(new Set(codes(res))).toEqual(new Set(Object.keys(E)));
    const naing = itemsOf(res).find((item) => item.employee_code === 'E009');
    expect(naing).toMatchObject({ status: 0, login_status: 0, branches: [] });
  });

  it('Scenario: A manager sees her branch', async () => {
    const res = await list(hnin);
    expect(res.status).toBe(200);
    expect((res.body as { total: number }).total).toBe(5);
    expect(codes(res).sort()).toEqual(['E001', 'E002', 'E004', 'E005', 'E008']);
    // U Kyaw Zin's branches show B1, B2 and B3 — all of his active assignments, not only hers.
    const admin = itemsOf(res).find((item) => item.employee_code === 'E001');
    expect(admin?.branches.map((branch) => branch.code)).toEqual(['B1', 'B2', 'B3']);
  });

  it('Scenario: A barber is refused', async () => {
    const res = await list(aung);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'employee.view' } });
  });

  it('Scenario: A signed-out caller is refused', async () => {
    const res = await list();
    expect(res.status).toBe(401);
  });

  it('Scenario: A branch-scope holder whose branches have no employees sees none', async () => {
    const companyId = (await t.prisma.employees.findUniqueOrThrow({ where: { id: E.E004 } }))
      .company_id;
    const empty = await createBranch(t.prisma, companyId);
    await assignRole(t.prisma, {
      name: 'Viewer of an empty branch',
      employeeId: E.E004,
      codes: ['employee.view'],
      scope: ScopeType.BRANCHES,
      branchIds: [empty],
    });
    const res = await list(await t.signIn('E004'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], next_cursor: null, total: 0 });
  });

  it('Scenario: The items carry the active roles', async () => {
    const res = await list(kyawZin);
    const roles = (code: string) =>
      itemsOf(res)
        .find((item) => item.employee_code === code)
        ?.roles.map((role) => role.name_en);
    expect(roles('E001')).toEqual(['Admin']);
    expect(roles('E002')).toEqual(['Manager']);
    expect(roles('E009')).toEqual(['Barber']);
    // A revoked assignment is not listed.
    await t.prisma.employee_roles.updateMany({
      where: { employee_id: E.E009 },
      data: { revoked_at: new Date('2026-10-05T09:00:00+06:30') },
    });
    const after = itemsOf(await list(kyawZin)).find((item) => item.employee_code === 'E009');
    expect(after?.roles).toEqual([]);
  });

  it("Scenario: An assignment's last day", async () => {
    // Ma Thida's B3 assignment ends 05/Oct/2026 (inclusive); Ma Hnin lists at 23:59 and at 00:00.
    const assignment = await t.prisma.employee_branches.findFirstOrThrow({
      where: { employee_id: E.E008, branch_id: B.B3 },
    });
    await endAssignment(t.prisma, assignment.id, '2026-10-05');
    t.clock?.set(new Date('2026-10-05T23:59:00+06:30'));
    const before = await list(hnin);
    expect((before.body as { total: number }).total).toBe(5);
    t.clock?.set(new Date('2026-10-06T00:00:00+06:30'));
    const after = await list(hnin);
    expect((after.body as { total: number }).total).toBe(4);
    expect(codes(after)).not.toContain('E008');
    // A company-scope holder still sees her; an assignment not yet started is not active.
    expect((await list(kyawZin)).body).toMatchObject({ total: 9 });
    t.clock?.set(new Date('2026-10-05T09:30:00+06:30'));
    await assignAt(t.prisma, { employeeId: E.E009, branchId: B.B3, from: '2026-10-06' });
    expect(codes(await list(hnin))).not.toContain('E009');
  });
});
