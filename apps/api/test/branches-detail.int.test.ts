import { branchSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assignAt } from './helpers/branches.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-branch-management tasks 2.4 / 2.5 — organization spec "active_employees counts the employees
// assigned to the branch today" and the detail of "A branch's detail is read by any signed-in staff
// member inside their read scope" (P1.BR.03 · D-EMP-01 · D-PLT-15 · proposal readings 3 / 4). The
// clock is the test's: the Myanmar day turns at 00:00 MMT (17:30 UTC), never at UTC midnight.
const B = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
let t: SeededApp;
let kyawZin: { readonly cookie: string };

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T09:30:00+06:30') });
  kyawZin = await t.signIn('E001');
});
afterAll(async () => {
  await t.close();
});

const read = async (id: string) => {
  const res = await t.http.get(`/api/v1/branches/${id}`).set('Cookie', kyawZin.cookie);
  expect(res.status).toBe(200);
  return branchSchema.parse(res.body);
};
const at = (instant: string) => t.clock?.set(new Date(instant));

describe('add-branch-management · organization · active_employees counts the employees assigned to the branch today', () => {
  it('Scenario: Fixture counts', async () => {
    expect((await read(B.B3)).active_employees).toBe(5); // Ko Naing's assignment ended 30/Sep/2026
    expect((await read(B.B1)).active_employees).toBe(3);
    expect((await read(B.B2)).active_employees).toBe(2);
  });

  it('Scenario: The last day of an assignment still counts', async () => {
    await t.prisma.employee_branches.updateMany({
      where: { employee_id: E.E008, branch_id: B.B3 },
      data: { effective_to: new Date('2026-10-05T00:00:00Z') },
    });
    at('2026-10-05T23:59:00+06:30');
    expect((await read(B.B3)).active_employees).toBe(5);
    at('2026-10-06T00:00:00+06:30');
    expect((await read(B.B3)).active_employees).toBe(4); // 5 − Ma Thida
  });

  it('Scenario: An assignment that starts tomorrow does not count yet', async () => {
    // Ma Thida back on B3 for this scenario's own count; Ko Htet from 06/Oct.
    await t.prisma.employee_branches.updateMany({
      where: { employee_id: E.E008, branch_id: B.B3 },
      data: { effective_to: null },
    });
    await assignAt(t.prisma, { employeeId: E.E006, branchId: B.B3, from: '2026-10-06' });
    at('2026-10-05T12:00:00+06:30');
    expect((await read(B.B3)).active_employees).toBe(5);
    at('2026-10-06T12:00:00+06:30');
    expect((await read(B.B3)).active_employees).toBe(6); // 5 + Ko Htet
  });

  it('two assignments of one employee at the branch count once (distinct employees)', async () => {
    await assignAt(t.prisma, {
      employeeId: E.E004,
      branchId: B.B3,
      from: '2026-10-06',
      to: '2026-10-31',
    });
    expect((await read(B.B3)).active_employees).toBe(6);
  });
});

describe("add-branch-management · organization · A branch's detail is read by any signed-in staff member inside their read scope — the Branch members", () => {
  it('the answer is the full Branch: BranchSummary + its own members, social_links {} when none', async () => {
    const b1 = await read(B.B1);
    expect(b1).toMatchObject({
      id: B.B1,
      code: 'B1',
      name_en: 'Point 1.0',
      name_mm: 'ပွိုင့် ၁.၀',
      email: null,
      address_mm: null,
      address_en: null,
      website_url: null,
      social_links: {},
      latitude: null,
      longitude: null,
      map_url: null,
    });
    expect(b1.updated_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}\+06:30$/);
    expect(b1.created_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+06:30$/);
  });
});
