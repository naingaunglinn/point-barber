import { ScopeType } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { EMPLOYEE_UPDATE_FIELDS } from './employee-fields.js';
import { type Target, decideFields } from '../../../common/access/decide.js';
import type { CanFieldsDeclaration } from '../../../common/access/declarations.js';
import { type AssignmentRow, GrantSet } from '../../../common/access/grant-set.js';

// add-employee-management task 2.1 — `@CanFields` (design D2 · P1.EMP.04): every member of PATCH
// /v1/employees/{id} against each of the three codes at company scope, at a branch scope that overlaps
// the employee's active branches, at another branch, and with no code.

const B1 = 'b1';
const B3 = 'b3';
const CODES = ['employee.update', 'employee.rating_update', 'employee.earnings_update'] as const;

const row = (code: string, scope: number, branchIds: string[] = []): AssignmentRow => ({
  code,
  module: 'employee',
  scope_type: scope,
  revoked_at: null,
  permission_archived_at: null,
  role_archived_at: null,
  role_status: 1,
  branch_ids: branchIds,
});
const grants = (...rows: AssignmentRow[]) =>
  GrantSet.build({ assignments: rows, branches: [] }, '2026-10-05');

const declaration: CanFieldsDeclaration = {
  kind: 'canFields',
  fields: EMPLOYEE_UPDATE_FIELDS,
  target: 'employee:id',
};
// Ko Aung works at B3 and B1 (match: any — one overlapping branch is enough).
const KO_AUNG: Target = { kind: 'branches', branchIds: [B3, B1], match: 'any' };
const decide = (g: GrantSet, body: unknown, target: Target = KO_AUNG) =>
  decideFields(declaration, g, target, 'PATCH', body);

const situations = {
  company: (code: string) => grants(row(code, ScopeType.COMPANY)),
  overlapping: (code: string) => grants(row(code, ScopeType.BRANCHES, [B3])),
  other: (code: string) => grants(row(code, ScopeType.BRANCHES, ['b9'])),
  none: () => grants(),
};

const cases = Object.entries(EMPLOYEE_UPDATE_FIELDS).flatMap(([member, needed]) =>
  CODES.flatMap((held) =>
    (['company', 'overlapping', 'other', 'none'] as const).map(
      (situation) => [member, needed, held, situation] as const,
    ),
  ),
);

describe('@CanFields — every member × code × scope (task 2.1)', () => {
  it.each(cases)('%s (needs %s), caller holds %s, %s scope', (member, needed, held, situation) => {
    const decision = decide(situations[situation](held), { [member]: 'x' });
    if (held === needed && (situation === 'company' || situation === 'overlapping')) {
      expect(decision).toEqual({ allow: true });
      return;
    }
    expect(decision).toMatchObject({ allow: false, status: 403, code: 'forbidden' });
    if (decision.allow) return;
    // The member whose group failed is named, with the code its group needs.
    expect(decision.errors).toEqual([
      { field: member, code: 'forbidden', params: { required: needed } },
    ]);
    expect(decision.required).toBe(needed);
  });

  it('refuses the whole request when a group fails, naming only the failed members', () => {
    const g = grants(row('employee.update', ScopeType.BRANCHES, [B3]));
    const body = { name_mm: 'x', phone: 'y', public_rating: 4, show_own_earnings: true };
    expect(decide(g, body)).toEqual({
      allow: false,
      status: 403,
      code: 'forbidden',
      required: 'employee.rating_update',
      errors: [
        {
          field: 'public_rating',
          code: 'forbidden',
          params: { required: 'employee.rating_update' },
        },
        {
          field: 'show_own_earnings',
          code: 'forbidden',
          params: { required: 'employee.earnings_update' },
        },
      ],
    });
  });

  it('allows a body whose groups all pass, each with its own code', () => {
    const g = grants(
      row('employee.update', ScopeType.COMPANY),
      row('employee.rating_update', ScopeType.BRANCHES, [B3]),
    );
    expect(decide(g, { name_mm: 'x', public_rating: 4 })).toEqual({ allow: true });
  });

  it('ignores members that are in no group', () => {
    const g = grants(row('employee.update', ScopeType.COMPANY));
    expect(decide(g, { name_mm: 'x', unknown_member: 1 })).toEqual({ allow: true });
  });

  it.each([{}, undefined, null, []])('an empty body (%j) passes with any one code', (body) => {
    for (const code of CODES) {
      expect(decide(grants(row(code, ScopeType.BRANCHES, [B3])), body)).toEqual({ allow: true });
    }
  });

  it('an empty body is refused without any code, and outside the scope of the one held', () => {
    expect(decide(grants(), {})).toMatchObject({ allow: false, status: 403, code: 'forbidden' });
    expect(decide(grants(row('employee.rating_update', ScopeType.BRANCHES, ['b9'])), {})).toEqual({
      allow: false,
      status: 403,
      code: 'forbidden',
      required: 'employee.rating_update',
    });
  });

  it('an unknown employee is 404 before any group is decided', () => {
    const g = grants(row('employee.update', ScopeType.COMPANY));
    const missing: Target = { kind: 'missing' };
    const notFound = { allow: false, status: 404, code: 'not_found' };
    expect(decide(g, { public_rating: 4 }, missing)).toEqual(notFound);
    expect(decide(g, {}, missing)).toEqual(notFound);
  });

  it('a caller with none of the codes gets 403 whether or not the employee exists', () => {
    const missing: Target = { kind: 'missing' };
    expect(decide(grants(), { name_mm: 'x' }, missing)).toMatchObject({
      allow: false,
      status: 403,
      code: 'forbidden',
      required: 'employee.update',
    });
  });

  it('an employee with no active branch is reached at company scope only', () => {
    const none: Target = { kind: 'branches', branchIds: [], match: 'any' };
    expect(decide(situations.company('employee.update'), { name_mm: 'x' }, none)).toEqual({
      allow: true,
    });
    expect(decide(situations.overlapping('employee.update'), { name_mm: 'x' }, none)).toMatchObject(
      { allow: false, status: 403 },
    );
  });
});
