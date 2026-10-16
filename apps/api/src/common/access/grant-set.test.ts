import { ScopeType } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { type AssignmentRow, type BranchAssignmentRow, GrantSet } from './grant-set.js';

// add-foundation-auth-access task 4.5 — "Grants and read scope are worked out from the assignments on
// every request" (P1-RULE-05 · D-ROLE-04 · D-ROLE-05 · design D11).

const B1 = 'b1';
const B2 = 'b2';
const B3 = 'b3';
const TODAY = '2026-10-05';
const MANAGER = [
  'employee.view',
  'employee.rating_update',
  'role.assign',
  'settings.view',
  'settings.update',
  'branch.view',
];

const row = (
  code: string,
  scope: number,
  branchIds: string[] = [],
  extra: Partial<AssignmentRow> = {},
): AssignmentRow => ({
  code,
  module: code.split('.')[0] ?? code,
  scope_type: scope,
  revoked_at: null,
  permission_archived_at: null,
  role_archived_at: null,
  branch_ids: branchIds,
  ...extra,
});
const assigned = (
  branch_id: string,
  from = '2026-09-01',
  to: string | null = null,
): BranchAssignmentRow => ({
  branch_id,
  effective_from: from,
  effective_to: to,
});
const ids = (scope: { all: boolean; branchIds: ReadonlySet<string> }) =>
  scope.all ? 'all' : [...scope.branchIds].sort();

describe('GrantSet (task 4.5)', () => {
  it('a branch manager: each Manager code for B3 only; read scope {B3}', () => {
    const grants = GrantSet.build(
      {
        assignments: MANAGER.map((code) => row(code, ScopeType.BRANCHES, [B3])),
        branches: [assigned(B3)],
      },
      TODAY,
    );
    for (const code of MANAGER) {
      expect(grants.covers(code, B3)).toBe(true);
      expect(grants.covers(code, B1)).toBe(false);
      expect(grants.covers(code, B2)).toBe(false);
      expect(grants.isCompany(code)).toBe(false);
    }
    expect(ids(grants.readScope)).toStrictEqual([B3]);
  });

  it('a barber without any code still has a read scope', () => {
    const grants = GrantSet.build({ assignments: [], branches: [assigned(B3)] }, TODAY);
    expect(grants.has('employee.view')).toBe(false);
    expect(grants.anyOf('employee')).toBe(false);
    expect(ids(grants.readScope)).toStrictEqual([B3]);
  });

  it('company scope covers every branch, and the read scope is all branches', () => {
    const grants = GrantSet.build(
      {
        assignments: [
          row('role.update', ScopeType.COMPANY),
          row('employee.view', ScopeType.COMPANY),
        ],
        branches: [],
      },
      TODAY,
    );
    for (const branch of [B1, B2, B3]) expect(grants.covers('role.update', branch)).toBe(true);
    expect(grants.isCompany('role.update')).toBe(true);
    expect(grants.readScope.all).toBe(true);
    expect(grants.branchesOfModule('employee').all).toBe(true);
  });

  it('two assignments add up per code', () => {
    const grants = GrantSet.build(
      {
        assignments: [
          ...MANAGER.map((code) => row(code, ScopeType.BRANCHES, [B3])),
          row('employee.view', ScopeType.BRANCHES, [B1]),
        ],
        branches: [assigned(B3)],
      },
      TODAY,
    );
    expect(ids(grants.branches('employee.view'))).toStrictEqual([B1, B3]);
    expect(ids(grants.branches('settings.update'))).toStrictEqual([B3]);
    expect(ids(grants.readScope)).toStrictEqual([B1, B3]);
  });

  it('a revoked assignment contributes nothing and leaves the other alone', () => {
    const grants = GrantSet.build(
      {
        assignments: [
          ...MANAGER.map((code) => row(code, ScopeType.BRANCHES, [B3])),
          row('employee.view', ScopeType.BRANCHES, [B1], {
            revoked_at: new Date('2026-10-05T07:30:00Z'),
          }),
        ],
        branches: [assigned(B3)],
      },
      TODAY,
    );
    expect(ids(grants.branches('employee.view'))).toStrictEqual([B3]);
    expect(ids(grants.readScope)).toStrictEqual([B3]);
  });

  it('an archived permission or an archived role contributes nothing', () => {
    const grants = GrantSet.build(
      {
        assignments: [
          row('role.update', ScopeType.COMPANY, [], {
            permission_archived_at: new Date('2026-10-01T00:00:00Z'),
          }),
          row('role.view', ScopeType.COMPANY, [], {
            role_archived_at: new Date('2026-10-01T00:00:00Z'),
          }),
        ],
        branches: [assigned(B3)],
      },
      TODAY,
    );
    expect(grants.has('role.update')).toBe(false);
    expect(grants.has('role.view')).toBe(false);
    expect(grants.readScope.all).toBe(false);
  });

  it('a branch assignment counts only from its first day to its last', () => {
    const grants = GrantSet.build(
      {
        assignments: [],
        branches: [
          assigned(B1, '2026-10-06'),
          assigned(B2, '2026-09-01', '2026-10-04'),
          assigned(B3, '2026-09-01', TODAY),
        ],
      },
      TODAY,
    );
    expect(ids(grants.readScope)).toStrictEqual([B3]);
  });

  it('the read scope is the branch assignments together with every branch a grant covers', () => {
    const grants = GrantSet.build(
      { assignments: [row('closing.reopen', ScopeType.BRANCHES, [B2])], branches: [assigned(B3)] },
      TODAY,
    );
    expect(ids(grants.readScope)).toStrictEqual([B2, B3]);
  });

  it('a module is reached through any of its codes', () => {
    const grants = GrantSet.build(
      { assignments: [row('role.assign', ScopeType.BRANCHES, [B3])], branches: [assigned(B3)] },
      TODAY,
    );
    expect(grants.anyOf('role')).toBe(true);
    expect(grants.anyOf('employee')).toBe(false);
    expect(grants.isCompanyInModule('role')).toBe(false);
    expect(ids(grants.branchesOfModule('role'))).toStrictEqual([B3]);
    expect(ids(grants.branchesOfModule('employee'))).toStrictEqual([]);
  });

  it('merges one grant per code, sorted by code', () => {
    const grants = GrantSet.build(
      {
        assignments: [
          row('settings.view', ScopeType.BRANCHES, [B3]),
          row('employee.view', ScopeType.BRANCHES, [B3]),
          row('employee.view', ScopeType.BRANCHES, [B1]),
          row('settings.view', ScopeType.COMPANY),
        ],
        branches: [],
      },
      TODAY,
    );
    expect(grants.merged()).toStrictEqual([
      { code: 'employee.view', scope_type: ScopeType.BRANCHES, branch_ids: [B1, B3] },
      { code: 'settings.view', scope_type: ScopeType.COMPANY, branch_ids: [] },
    ]);
  });
});
