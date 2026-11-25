import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-employee-management tasks 2.1 / 2.2 — the access rules of `PATCH /v1/employees/{id}` through the
// guard (P1.EMP.04 · API-PERM-02 / 03 · P1-RULE-11 · design D2): "A profile update needs the code of each
// field group it touches". Monday 05/Oct/2026 from 9:30 AM MMT. The seed Manager (Ma Hnin, B3) holds
// employee.rating_update but not employee.update or employee.earnings_update. The update itself is
// built in group 4: a request that passes the guard reaches a handler that is not built yet, so the
// allowed cases only assert that the guard did not refuse.
const E = FIXTURE_IDS.employees;
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

const patch = (id: string, body: object, caller?: Caller) => {
  const request = t.http.patch(`/api/v1/employees/${id}`);
  return (caller === undefined ? request : request.set('Cookie', caller.cookie)).send(body);
};
const forbiddenMember = (field: string, required: string) => ({
  field,
  code: 'forbidden',
  params: { required },
});
const nameOf = async (id: string) =>
  (await t.prisma.employees.findUniqueOrThrow({ where: { id } })).name_mm;
const UNKNOWN = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';

describe('add-employee-management · organization · A profile update needs the code of each field group it touches', () => {
  it('Scenario: A caller with none of the codes is refused, naming each member', async () => {
    const res = await patch(E.E005, { name_mm: 'x', public_rating: 4 }, aung);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
      context: { required: 'employee.update' },
      errors: [
        forbiddenMember('name_mm', 'employee.update'),
        forbiddenMember('public_rating', 'employee.rating_update'),
      ],
    });
  });

  it('Scenario: One group the caller may not change spoils the request, and nothing changes', async () => {
    const before = await nameOf(E.E004);
    const res = await patch(E.E004, { name_mm: 'x', public_rating: 4 }, hnin);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
      context: { required: 'employee.update' },
      errors: [forbiddenMember('name_mm', 'employee.update')],
    });
    expect(await nameOf(E.E004)).toBe(before);
  });

  it('Scenario: The earnings flag needs its own code', async () => {
    const res = await patch(E.E004, { show_own_earnings: true }, hnin);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
      context: { required: 'employee.earnings_update' },
      errors: [forbiddenMember('show_own_earnings', 'employee.earnings_update')],
    });
  });

  it('Scenario: An employee of another branch is refused, as a write (403, not 404)', async () => {
    // Ko Htet works at B1 only; Ma Hnin's rating code covers B3.
    const res = await patch(E.E006, { public_rating: 4 }, hnin);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
      context: { required: 'employee.rating_update' },
      errors: [forbiddenMember('public_rating', 'employee.rating_update')],
    });
  });

  it('Scenario: An employee in the scope passes the guard with the code of the group', async () => {
    const res = await patch(E.E004, { public_rating: 4 }, hnin);
    expect([403, 404]).not.toContain(res.status);
  });

  it('Scenario: The admin passes at company scope, also for an employee with no branch', async () => {
    for (const id of [E.E004, E.E006, E.E009]) {
      const res = await patch(
        id,
        { name_mm: 'x', public_rating: 4, show_own_earnings: true },
        kyawZin,
      );
      expect([403, 404]).not.toContain(res.status);
    }
  });

  it('Scenario: An empty body passes with any one of the codes and not without', async () => {
    expect([403, 404]).not.toContain((await patch(E.E004, {}, hnin)).status);
    const refused = await patch(E.E004, {}, aung);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'forbidden' });
    // Holds the code, but not for Ko Htet's branches.
    expect((await patch(E.E006, {}, hnin)).status).toBe(403);
  });

  it('Scenario: An unknown employee is 404 for a holder and 403 for a caller with no code', async () => {
    const holder = await patch(UNKNOWN, { name_mm: 'x' }, kyawZin);
    expect(holder.status).toBe(404);
    expect(holder.body).toMatchObject({ code: 'not_found' });
    expect((await patch(UNKNOWN, { name_mm: 'x' }, aung)).status).toBe(403);
    expect((await patch('not-a-uuid', { name_mm: 'x' }, kyawZin)).status).toBe(404);
  });

  it('Scenario: A signed-out caller is refused', async () => {
    expect((await patch(E.E004, { name_mm: 'x' })).status).toBe(401);
  });
});
