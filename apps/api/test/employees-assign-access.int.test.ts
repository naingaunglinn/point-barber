import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addCodeToRole } from './helpers/branches.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-employee-management task 2.2 — the access rule of `POST /v1/employees/{id}/branches` through the
// guard (P1.EMP.07 · P1-RULE-11 · design D2): the caller's scope must cover the target branch AND reach
// the employee's active branches. Both options of the declaration are checked; before, the guard read
// `target` and never `branch`. Monday 05/Oct/2026. The assignment itself is built in group 6: a request
// that passes the guard reaches a handler that is not built yet, so the allowed case only asserts that
// the guard did not refuse.
const E = FIXTURE_IDS.employees;
const { B1, B3 } = FIXTURE_IDS.branches;
type Caller = { readonly cookie: string };
let t: SeededApp;
let hnin: Caller;
let zaw: Caller;

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T09:30:00+06:30') });
  // The seed Manager has no employee.branch_assign; the two managers get it at their own branch.
  await addCodeToRole(t.prisma, 'Manager', 'employee.branch_assign');
  [hnin, zaw] = await Promise.all([t.signIn('E002'), t.signIn('E003')]);
});
afterAll(async () => {
  await t.close();
});

const assign = (employeeId: string, branchId: string, caller: Caller) =>
  t.http
    .post(`/api/v1/employees/${employeeId}/branches`)
    .set('Cookie', caller.cookie)
    .send({ branch_id: branchId });

describe('add-employee-management · organization · A branch assignment needs the code for the target branch and for the employee', () => {
  it('Scenario: Ma Hnin (B3) assigns Ko Min (B3) to B1 → 403, the target branch is outside her scope', async () => {
    const res = await assign(E.E005, B1, hnin);
    expect([res.status, res.body.code]).toStrictEqual([403, 'forbidden']);
  });

  it('Scenario: Ko Zaw (B1) assigns Ko Min (B3) to B1 → 403, the employee is outside his scope', async () => {
    const res = await assign(E.E005, B1, zaw);
    expect([res.status, res.body.code]).toStrictEqual([403, 'forbidden']);
  });

  it('Scenario: Ma Hnin (B3) assigns Ko Min (B3) to B3 → the guard lets it through', async () => {
    const res = await assign(E.E005, B3, hnin);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
