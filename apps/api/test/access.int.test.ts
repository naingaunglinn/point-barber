import { ScopeType } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppConfig } from '../src/common/config/config.js';
import {
  BRANCH_NOTES,
  STAFF_CARDS,
  STAFF_ROWS,
  accessCalls,
} from './fixtures/access.controller.js';
import { actionCalls } from './fixtures/audit.controller.js';
import { undeclaredCalls } from './fixtures/undeclared.controller.js';
import { assignRole } from './helpers/roles.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-foundation-auth-access tasks 4.11–4.13 — the access spec on the fixture endpoints of design D14,
// with the seed people of spec-fixtures §2 (API-PERM-02 / 03 / 04 / 07 · ADR-012 · P1-RULE-05 /
// 11 / 13 · D-ROLE-06 / 07 · ADR-009).
const { B1, B2, B3 } = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
const F = '/api/v1/_fixtures';
let t: SeededApp;
type Caller = { readonly cookie: string };
let kyawZin: Caller; // Admin, company scope
let hnin: Caller; // Manager, B3
let zaw: Caller; // Manager, B1
let aung: Caller; // Barber, B3, no code

beforeAll(async () => {
  t = await startSeededApp();
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
  const request = t.http.get(`${F}/${path}`);
  return caller === undefined ? request : request.set('Cookie', caller.cookie);
};
const post = (path: string, caller: Caller) =>
  t.http.post(`${F}/${path}`).set('Cookie', caller.cookie);
const put = (path: string, caller: Caller) =>
  t.http.put(`${F}/${path}`).set('Cookie', caller.cookie);
const ids = (body: { items: { id: string }[] }) => body.items.map((item) => item.id).sort();
const notesAt = (...branches: string[]) =>
  BRANCH_NOTES.filter((note) => branches.includes(note.branch_id))
    .map((note) => note.id)
    .sort();

describe('add-foundation-auth-access · access · Company-master targets are changed only with company scope and read with any scope', () => {
  it('Scenario: Branch-scope holder of a company code cannot write', async () => {
    await assignRole(t.prisma, {
      name: 'Senior manager',
      employeeId: E.E003,
      codes: ['role.update'],
      scope: ScopeType.BRANCHES,
      branchIds: [B1],
    });
    const before = actionCalls.company_action;
    const res = await post('company-action', zaw);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'company_scope_required' });
    expect(actionCalls.company_action).toBe(before);
  });

  it('Scenario: Company-scope holder can write', async () => {
    expect((await post('company-action', kyawZin)).status).toBe(200);
  });

  it('Scenario: Caller without the code', async () => {
    const res = await post('company-action', hnin);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'role.update' } });
  });

  it('Scenario: Any code of the module opens the company-master read', async () => {
    expect((await get('company-read', hnin)).status).toBe(200);
  });

  it('Scenario: No code of the module', async () => {
    const res = await get('company-read', aung);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'role.view' } });
  });
});

describe('add-foundation-auth-access · access · A branch-data action needs the code for the branch it touches', () => {
  it('Scenario: Manager acts in her own branch', async () => {
    expect((await post('branch-action', hnin).send({ branch_id: B3 })).status).toBe(200);
  });

  it('Scenario: Manager acts in another branch', async () => {
    const before = actionCalls.branch_action;
    const res = await post('branch-action', hnin).send({ branch_id: B1 });
    expect(res.status).toBe(403);
    // API-PERM-03 v1.6: a holder without the target branch is told the code, like a caller without it.
    expect(res.body).toMatchObject({
      code: 'forbidden',
      context: { required: 'employee.rating_update' },
    });
    expect(actionCalls.branch_action).toBe(before);
  });

  it('Scenario: Barber of B3 calls a B1 resource', async () => {
    for (const branch of [B1, B3]) {
      const res = await post('branch-action', aung).send({ branch_id: branch });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: 'forbidden',
        context: { required: 'employee.rating_update' },
      });
    }
  });

  it('Scenario: Company scope covers a branch the caller is not listed for', async () => {
    expect((await post('branch-action', kyawZin).send({ branch_id: B2 })).status).toBe(200);
  });

  it('Scenario: Every branch of a multi-branch body must be covered', async () => {
    const before = actionCalls.branch_items;
    const both = await post('branch-items', hnin).send({
      items: [{ branch_id: B3 }, { branch_id: B1 }],
    });
    expect(both.status).toBe(403);
    expect(both.body).toMatchObject({ code: 'forbidden' });
    expect(actionCalls.branch_items).toBe(before);
    expect((await post('branch-items', hnin).send({ items: [{ branch_id: B3 }] })).status).toBe(
      200,
    );
  });

  it('Scenario: The branch is taken from the loaded entity', async () => {
    const b3Note = BRANCH_NOTES.find((note) => note.branch_id === B3);
    const before = accessCalls.archive;
    const res = await post(`branch-notes/${b3Note?.id}/archive`, zaw);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden' });
    expect(accessCalls.archive).toBe(before);
  });
});

describe('add-foundation-auth-access · access · Reads outside the caller’s scope reveal nothing', () => {
  it('Scenario: A list is filtered to the caller’s branch', async () => {
    const res = await get('branch-notes', hnin);
    expect(res.status).toBe(200);
    expect(ids(res.body)).toStrictEqual(notesAt(B3));
  });

  it('Scenario: Company scope sees every branch', async () => {
    const res = await get('branch-notes', kyawZin);
    expect(res.body.items).toHaveLength(6);
  });

  it('Scenario: A filter outside the scope gives an empty list, not an error', async () => {
    const res = await get(`branch-notes?branch_id=${B1}`, hnin);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ items: [], next_cursor: null });
  });

  it('Scenario: A single read outside the scope looks like "not found"', async () => {
    const b1Note = BRANCH_NOTES.find((note) => note.branch_id === B1);
    const outside = await get(`branch-notes/${b1Note?.id}`, hnin);
    expect(outside.status).toBe(404);
    expect(outside.body).toMatchObject({ code: 'not_found' });
    const unknown = await get('branch-notes/0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70', hnin);
    expect(unknown.status).toBe(404);
    expect(Object.keys(outside.body).sort()).toStrictEqual(Object.keys(unknown.body).sort());
  });

  it('Scenario: No code of the module at all', async () => {
    const res = await get('branch-notes', aung);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'employee.view' } });
  });
});

describe('add-foundation-auth-access · access · A mixed target is company master when no branch is named and branch data when one is', () => {
  it('Scenario: Branch manager without a branch in the request', async () => {
    const res = await put('mixed-value', hnin).send({ value: 30 });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'company_scope_required' });
  });

  it('Scenario: Branch manager with her own branch', async () => {
    expect((await put('mixed-value', hnin).send({ value: 30, branch_id: B3 })).status).toBe(200);
  });

  it('Scenario: Branch manager with another branch', async () => {
    const res = await put('mixed-value', hnin).send({ value: 30, branch_id: B1 });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden' });
  });

  it('Scenario: Company admin without a branch', async () => {
    expect((await put('mixed-value', kyawZin).send({ value: 30 })).status).toBe(200);
  });
});

describe('add-foundation-auth-access · access · Shared targets accept any assignment and private targets accept company scope only', () => {
  beforeAll(async () => {
    await assignRole(t.prisma, {
      name: 'Fixture reader',
      employeeId: E.E002,
      codes: ['fixture.shared_view', 'fixture.private_view'],
      scope: ScopeType.BRANCHES,
      branchIds: [B3],
    });
  });

  it('Scenario: Shared code at branch scope', async () => {
    expect((await get('shared-read', hnin)).status).toBe(200);
  });

  it('Scenario: Private code at branch scope reaches nothing — not even a list', async () => {
    const res = await get('private-list', hnin);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'company_scope_required' });
  });

  it('Scenario: Private code at company scope', async () => {
    const res = await get('private-list', kyawZin);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(6);
  });
});

describe('add-foundation-auth-access · access · The subject of a record may reach it without the code', () => {
  it('Scenario: A barber reads his own record', async () => {
    expect((await get(`staff-cards/${STAFF_CARDS.E004.id}`, aung)).status).toBe(200);
  });

  it('Scenario: A barber cannot read a colleague’s record', async () => {
    const res = await get(`staff-cards/${STAFF_CARDS.E005.id}`, aung);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'employee.view' } });
  });

  it('Scenario: A manager reads a record of her branch and gets 404 for another branch', async () => {
    expect((await get(`staff-cards/${STAFF_CARDS.E004.id}`, hnin)).status).toBe(200);
    const res = await get(`staff-cards/${STAFF_CARDS.E006.id}`, hnin);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'not_found' });
  });
});

describe('add-foundation-auth-access · access · Every endpoint’s access declaration is enforced at run time and an undeclared endpoint is closed', () => {
  it('Scenario: Staff endpoint needs a session but no code', async () => {
    expect((await get('staff-read', aung)).status).toBe(200);
    const res = await get('staff-read');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'unauthenticated' });
  });

  it('Scenario: An undeclared endpoint is closed even for the admin', async () => {
    const before = undeclaredCalls.count;
    const res = await get('undeclared', kyawZin);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden' });
    expect(undeclaredCalls.count).toBe(before);
    expect((await get('undeclared')).status).toBe(401);
  });

  it("Scenario: Internal endpoint refuses the web container's key", async () => {
    const { INTERNAL_SSR_KEY, INTERNAL_OPS_KEY } = t.app.get(AppConfig).env;
    const ssr = await t.http.post(`${F}/internal`).set('X-Internal-Key', INTERNAL_SSR_KEY);
    expect(ssr.status).toBe(401);
    expect(ssr.body).toMatchObject({ code: 'unauthenticated' });
    expect((await t.http.post(`${F}/internal`)).status).toBe(401);
    const ops = await t.http.post(`${F}/internal`).set('X-Internal-Key', INTERNAL_OPS_KEY);
    expect(ops.status).toBe(200);
  });
});

describe('add-foundation-auth-access · access · Grants and read scope are worked out from the assignments on every request', () => {
  it('Scenario: An operational read is limited to the read scope', async () => {
    const all = await get('staff-read', aung);
    expect(all.body.items).toStrictEqual(STAFF_ROWS.filter((row) => row.branch_id === B3));
    const b1 = await get(`staff-read?branch_id=${B1}`, aung);
    expect(b1.status).toBe(200);
    expect(b1.body.items).toStrictEqual([]);
  });

  it('Scenarios: Two assignments add up · revoking one applies on the next request', async () => {
    const trainer = await assignRole(t.prisma, {
      name: 'Trainer',
      employeeId: E.E002,
      codes: ['employee.view'],
      scope: ScopeType.BRANCHES,
      branchIds: [B1],
    });
    // The same session throughout: no new sign-in.
    expect(ids((await get('branch-notes', hnin)).body)).toStrictEqual(notesAt(B1, B3));
    expect((await put('mixed-value', hnin).send({ value: 1, branch_id: B1 })).status).toBe(403);
    expect(ids((await get('staff-read', hnin)).body).length).toBe(2);

    await t.prisma.employee_roles.update({
      where: { id: trainer.assignmentId },
      data: { revoked_at: new Date('2026-10-05T14:00:00+06:30') },
    });
    expect(ids((await get('branch-notes', hnin)).body)).toStrictEqual(notesAt(B3));
    // Her Manager assignment is unchanged.
    expect((await put('mixed-value', hnin).send({ value: 1, branch_id: B3 })).status).toBe(200);
  });
});
