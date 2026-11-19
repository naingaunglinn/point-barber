import { describe, expect, it } from 'vitest';

import type { MeResponse } from '@point/shared';
import { ALL_BRANCHES } from '@point/ui';

import { initialBranchId, startBranchOf } from './branch';

// add-walkin-visit-checkout task 10.1 — the branch default of AD-NAV-04 and the branch START uses.
const B1 = '0198f0a0-0000-7000-8000-0000000000b1';
const B3 = '0198f0a0-0000-7000-8000-0000000000b3';
const branch = (id: string, code: string) => ({
  id,
  code,
  name_mm: code,
  name_en: code,
  phone: null,
  status: 1 as const,
  is_public: true,
});
const me = (over: Partial<MeResponse>): MeResponse =>
  ({
    grants: [],
    branches_in_scope: [branch(B1, 'B1'), branch(B3, 'B3')],
    today_branch_id: null,
    assigned_branch_ids: [B3],
    ...over,
  }) as unknown as MeResponse;

describe('AD-NAV-04 branch default', () => {
  it("today's branch first, else the first active assignment", () => {
    expect(initialBranchId(me({}))).toBe(B3);
    expect(initialBranchId(me({ today_branch_id: B1 }))).toBe(B1);
  });

  it('a company-scope user starts on All branches; START then uses the same order', () => {
    const admin = me({
      grants: [{ code: 'branch.view', scope_type: 1, branch_ids: [] }],
      assigned_branch_ids: [B1, B3],
    });
    expect(initialBranchId(admin)).toBe(ALL_BRANCHES);
    expect(startBranchOf(admin, ALL_BRANCHES)?.code).toBe('B1');
    expect(startBranchOf(admin, B3)?.code).toBe('B3');
  });

  it('no assignment and no branch in scope → no START branch', () => {
    expect(
      startBranchOf(me({ assigned_branch_ids: [], branches_in_scope: [] }), ALL_BRANCHES),
    ).toBe(null);
  });
});
