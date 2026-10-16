import { ScopeType } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { type Decision, type Target, decide } from './decide.js';
import type { CanDeclaration, CanViewDeclaration } from './declarations.js';
import { type AssignmentRow, GrantSet } from './grant-set.js';

// add-foundation-auth-access task 4.6 — the decision table of design D11, one case per row and level
// (API-PERM-02 / 03 / 04 / 07 · ADR-012 · P1-RULE-11).

const B1 = 'b1';
const B2 = 'b2';
const B3 = 'b3';

const row = (code: string, scope: number, branchIds: string[] = []): AssignmentRow => ({
  code,
  module: code.split('.')[0] ?? code,
  scope_type: scope,
  revoked_at: null,
  permission_archived_at: null,
  role_archived_at: null,
  role_status: 1,
  branch_ids: branchIds,
});
const grantsOf = (...rows: AssignmentRow[]) =>
  GrantSet.build({ assignments: rows, branches: [] }, '2026-10-05');

const people = {
  /** Admin: every code at company scope. */
  admin: grantsOf(
    ...['role.update', 'employee.view', 'employee.rating_update', 'settings.update'].map((c) =>
      row(c, ScopeType.COMPANY),
    ),
    row('fixture.private_view', ScopeType.COMPANY),
  ),
  /** Manager of B3. */
  manager: grantsOf(
    ...['employee.view', 'employee.rating_update', 'settings.update', 'role.assign'].map((c) =>
      row(c, ScopeType.BRANCHES, [B3]),
    ),
    row('fixture.shared_view', ScopeType.BRANCHES, [B3]),
    row('fixture.private_view', ScopeType.BRANCHES, [B3]),
  ),
  /** Barber: no code. */
  barber: grantsOf(),
  /** Holds the company code role.update only for B1. */
  seniorManager: grantsOf(row('role.update', ScopeType.BRANCHES, [B1])),
} as const;

type Person = keyof typeof people;

const can = (code: string, options: Omit<CanDeclaration, 'kind' | 'code'> = {}): CanDeclaration =>
  ({ kind: 'can', code, ...options }) as CanDeclaration;
const canView = (module: string, options: Omit<CanViewDeclaration, 'kind' | 'module'> = {}) =>
  ({ kind: 'canView', module, ...options }) as CanViewDeclaration;

const NONE: Target = { kind: 'none' };
const EMPTY: Target = { kind: 'empty' };
const MISSING: Target = { kind: 'missing' };
const at = (ids: string[], match: 'all' | 'any' = 'all', self = false): Target => ({
  kind: 'branches',
  branchIds: ids,
  match,
  self,
});

const allow: Decision = { allow: true };
const forbidden = (required?: string): Decision => ({
  allow: false,
  status: 403,
  code: 'forbidden',
  ...(required === undefined ? {} : { required }),
});
const companyRequired: Decision = { allow: false, status: 403, code: 'company_scope_required' };
const notFound: Decision = { allow: false, status: 404, code: 'not_found' };

const cases: readonly [
  string,
  Person,
  CanDeclaration | CanViewDeclaration,
  Target,
  string,
  Decision,
][] = [
  // Row 1 — no code, but the caller is the subject of the record.
  [
    '1 · orSelf by path, no code',
    'barber',
    can('employee.view', { branch: 'params.id→entity.branch_id', orSelf: 'entity.employee_id' }),
    at([B3], 'all', true),
    'GET',
    allow,
  ],
  [
    '1 · orSelf by resolver, no code',
    'barber',
    can('employee.rating_update', { branch: 'body.branch_id', orSelf: 'visit.lineActors' }),
    at([B1], 'all', true),
    'POST',
    allow,
  ],
  [
    '1 · employee target, own record',
    'barber',
    canView('employee', { target: 'employee:id', orSelf: 'employee.id' }),
    at([B3], 'any', true),
    'GET',
    allow,
  ],
  // Row 2 — no code: forbidden with the code, whether or not the target exists.
  [
    '2 · no code, colleague',
    'barber',
    can('employee.view', { branch: 'params.id→entity.branch_id', orSelf: 'entity.employee_id' }),
    at([B3]),
    'GET',
    forbidden('employee.view'),
  ],
  [
    '2 · no code, target missing',
    'barber',
    can('employee.view', { branch: 'params.id→entity.branch_id' }),
    MISSING,
    'GET',
    forbidden('employee.view'),
  ],
  [
    '2 · no code, own branch',
    'barber',
    can('employee.rating_update', { branch: 'body.branch_id' }),
    at([B3]),
    'POST',
    forbidden('employee.rating_update'),
  ],
  [
    '2 · @CanView, no code of the module',
    'barber',
    canView('role'),
    NONE,
    'GET',
    forbidden('role.view'),
  ],
  [
    '2 · @CanView list, no code of the module',
    'barber',
    canView('employee'),
    NONE,
    'GET',
    forbidden('employee.view'),
  ],
  // Row 3 — company and private levels.
  [
    '3 · company level at branch scope',
    'seniorManager',
    can('role.update', { level: 'company' }),
    NONE,
    'POST',
    companyRequired,
  ],
  [
    '3 · company level without the code',
    'manager',
    can('role.update', { level: 'company' }),
    NONE,
    'POST',
    forbidden('role.update'),
  ],
  [
    '3 · company level at company scope',
    'admin',
    can('role.update', { level: 'company' }),
    NONE,
    'POST',
    allow,
  ],
  [
    '3 · private level at branch scope',
    'manager',
    can('fixture.private_view', { level: 'private' }),
    NONE,
    'GET',
    companyRequired,
  ],
  [
    '3 · private @CanView list at branch scope',
    'manager',
    canView('fixture', { level: 'private' }),
    NONE,
    'GET',
    companyRequired,
  ],
  [
    '3 · private @CanView list at company scope',
    'admin',
    canView('fixture', { level: 'private' }),
    NONE,
    'GET',
    allow,
  ],
  // Row 4 — shared level.
  [
    '4 · shared level at branch scope',
    'manager',
    can('fixture.shared_view', { level: 'shared' }),
    NONE,
    'GET',
    allow,
  ],
  [
    '4 · shared @CanView at branch scope',
    'manager',
    canView('fixture', { level: 'shared' }),
    NONE,
    'GET',
    allow,
  ],
  // Row 5 — mixed: an optional branch left empty is company master.
  [
    '5 · mixed, empty, branch scope',
    'manager',
    can('settings.update', { branch: 'body.branch_id?' }),
    EMPTY,
    'PUT',
    companyRequired,
  ],
  [
    '5 · mixed, empty with empty: private',
    'manager',
    can('settings.update', { branch: 'body.branch_id?', empty: 'private' }),
    EMPTY,
    'PUT',
    companyRequired,
  ],
  [
    '5 · mixed, empty, company scope',
    'admin',
    can('settings.update', { branch: 'body.branch_id?' }),
    EMPTY,
    'PUT',
    allow,
  ],
  [
    '5 · mixed, own branch',
    'manager',
    can('settings.update', { branch: 'body.branch_id?' }),
    at([B3]),
    'PUT',
    allow,
  ],
  [
    '5 · mixed, another branch',
    'manager',
    can('settings.update', { branch: 'body.branch_id?' }),
    at([B1]),
    'PUT',
    forbidden(),
  ],
  // Row 6 — the entity or employee does not exist.
  [
    '6 · entity not found',
    'manager',
    can('employee.view', { branch: 'params.id→entity.branch_id' }),
    MISSING,
    'GET',
    notFound,
  ],
  [
    '6 · employee not found',
    'manager',
    canView('employee', { target: 'employee:id' }),
    MISSING,
    'GET',
    notFound,
  ],
  // Row 7 — the holder is also the subject.
  [
    '7 · holder reads own record outside the scope',
    'manager',
    can('employee.view', { branch: 'params.id→entity.branch_id', orSelf: 'entity.employee_id' }),
    at([B1], 'all', true),
    'GET',
    allow,
  ],
  // Rows 8–9 — the target is not covered.
  [
    '8 · branch read outside the scope',
    'manager',
    can('employee.view', { branch: 'params.id→entity.branch_id' }),
    at([B1]),
    'GET',
    notFound,
  ],
  [
    '8 · @CanView single read outside the scope',
    'manager',
    canView('employee', { target: 'employee:id' }),
    at([B1], 'any'),
    'GET',
    notFound,
  ],
  [
    '8 · employee without assignments, branch scope',
    'manager',
    canView('employee', { target: 'employee:id' }),
    at([], 'any'),
    'GET',
    notFound,
  ],
  [
    '9 · branch action in another branch',
    'manager',
    can('employee.rating_update', { branch: 'body.branch_id' }),
    at([B1]),
    'POST',
    forbidden(),
  ],
  [
    '9 · scopeError out_of_scope',
    'manager',
    can('employee.rating_update', { branch: 'body.branch_id', scopeError: 'out_of_scope' }),
    at([B1]),
    'POST',
    { allow: false, status: 403, code: 'out_of_scope' },
  ],
  [
    '9 · [] path, one branch uncovered',
    'manager',
    can('employee.rating_update', { branch: 'body.items[].branch_id' }),
    at([B3, B1]),
    'POST',
    forbidden(),
  ],
  [
    '9 · match any, no branch covered',
    'manager',
    can('employee.rating_update', { target: 'employee:id' }),
    at([B1, B2], 'any'),
    'PATCH',
    forbidden(),
  ],
  [
    '9 · required branch missing, branch scope',
    'manager',
    can('employee.rating_update', { branch: 'body.branch_id' }),
    at([]),
    'POST',
    forbidden(),
  ],
  // Row 10 — covered.
  [
    '10 · branch action in own branch',
    'manager',
    can('employee.rating_update', { branch: 'body.branch_id' }),
    at([B3]),
    'POST',
    allow,
  ],
  [
    '10 · [] path, every branch covered',
    'manager',
    can('employee.rating_update', { branch: 'body.items[].branch_id' }),
    at([B3, B3]),
    'POST',
    allow,
  ],
  [
    '10 · company scope covers an unlisted branch',
    'admin',
    can('employee.rating_update', { branch: 'body.branch_id' }),
    at([B2]),
    'POST',
    allow,
  ],
  [
    '10 · match any, one branch covered',
    'manager',
    canView('employee', { target: 'employee:id' }),
    at([B1, B3], 'any'),
    'GET',
    allow,
  ],
  [
    '10 · employee without assignments, company scope',
    'admin',
    canView('employee', { target: 'employee:id' }),
    at([], 'any'),
    'GET',
    allow,
  ],
  ['10 · @CanView list at branch scope', 'manager', canView('employee'), NONE, 'GET', allow],
  [
    '10 · @CanView company master, other code of the module',
    'manager',
    canView('role'),
    NONE,
    'GET',
    allow,
  ],
];

describe('decide() (task 4.6 · design D11)', () => {
  it.each(cases)('row %s', (_name, person, declaration, target, method, expected) => {
    expect(decide(declaration, people[person], target, method)).toStrictEqual(expected);
  });

  it('a GET and a changing method differ only outside the scope', () => {
    const declaration = can('employee.rating_update', { branch: 'body.branch_id' });
    expect(decide(declaration, people.manager, at([B3]), 'GET')).toStrictEqual(allow);
    expect(decide(declaration, people.manager, at([B3]), 'DELETE')).toStrictEqual(allow);
    expect(decide(declaration, people.manager, at([B1]), 'GET')).toStrictEqual(notFound);
    expect(decide(declaration, people.manager, at([B1]), 'DELETE')).toStrictEqual(forbidden());
  });
});
