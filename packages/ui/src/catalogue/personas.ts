import { BranchStatus, type BranchView, type MeGrants } from '@point/shared';

import { BRANCHES, PEOPLE, type BranchCode } from './fixtures';

// The catalogue's personas (`?as=` — add-shared-ui-components design D7): the `/me` access slice of each,
// over the seven-code fixture catalogue (levels as in API Parts 1, 2, 3, 5 and 7). Demos decide by can()
// only, never by the persona name (AD-META-06). Branch ids are the fixture branch codes; the branches in
// scope are the people's branches of spec-fixtures §2.

export const FIXTURE_PERMISSIONS = {
  'booking.create': { level: 'branch' },
  'booking.delete': { level: 'branch' },
  'closing.reopen': { level: 'branch' },
  'service.update': { level: 'mixed' },
  'role.update': { level: 'company' },
  'customer.update': { level: 'shared' },
  'payroll.view': { level: 'private' },
} as const;

export type FixturePermission = keyof typeof FIXTURE_PERMISSIONS;

export const PERSONAS = ['admin', 'manager', 'barber', 'branch-holder'] as const;
export type Persona = (typeof PERSONAS)[number];

const grantsOf = (
  scope: 1 | 2,
  branchIds: readonly string[],
  codes: readonly FixturePermission[],
): MeGrants['grants'] => codes.map((code) => ({ code, scope_type: scope, branch_ids: branchIds }));

/** A fixture branch as `/me` lists it; its id is its code, as in the grants above. */
const summaryOf = (code: BranchCode): BranchView => {
  const branch = BRANCHES.find((item) => item.code === code);
  if (branch === undefined) throw new Error(`unknown fixture branch ${code}`);
  return {
    id: code,
    code,
    name_mm: branch.name_mm,
    name_en: branch.name_en,
    status: BranchStatus.ACTIVE,
    is_public: true,
  };
};

const me = (grants: MeGrants['grants'], branches: readonly BranchCode[]): MeGrants => ({
  grants,
  effective: { show_own_earnings: false },
  branches_in_scope: branches.map(summaryOf),
});

export const PERSONA_GRANTS: Readonly<Record<Persona, MeGrants>> = {
  // U Kyaw Zin — all seven codes, company scope: everything visible.
  admin: me(
    grantsOf(1, [], Object.keys(FIXTURE_PERMISSIONS) as FixturePermission[]),
    PEOPLE.kyawZin.branches,
  ),
  // Ma Hnin — the codes the Manager seed holds (AD-PERM-06) at B3; no `closing.reopen`.
  manager: me(
    grantsOf(2, ['B3'], ['booking.create', 'booking.delete', 'service.update', 'customer.update']),
    PEOPLE.hnin.branches,
  ),
  // Ko Aung — no grant; own earnings off.
  barber: me([], PEOPLE.aung.branches),
  // Unnamed — branch scope gives read-only (company level) or nothing (private level).
  'branch-holder': me(grantsOf(2, ['B3'], ['role.update', 'payroll.view']), ['B3']),
};
