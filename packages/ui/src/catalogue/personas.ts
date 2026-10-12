import type { MeGrants } from '@point/shared';

import { createGrants } from '../permissions/grants';

// The catalogue's personas (`?as=` — add-shared-ui-components design D7): the `/me` access slice of each,
// over the seven-code fixture catalogue (levels as in API Parts 1, 2, 3, 5 and 7). Demos decide by can()
// only, never by the persona name (AD-META-06). Branch ids are the fixture branch codes.

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

const me = (grants: MeGrants['grants']): MeGrants => ({
  grants,
  effective: { show_own_earnings: false },
  branches_in_scope: [],
});

export const PERSONA_GRANTS: Readonly<Record<Persona, MeGrants>> = {
  // U Kyaw Zin — all seven codes, company scope: everything visible.
  admin: me(grantsOf(1, [], Object.keys(FIXTURE_PERMISSIONS) as FixturePermission[])),
  // Ma Hnin — the codes the Manager seed holds (AD-PERM-06) at B3; no `closing.reopen`.
  manager: me(
    grantsOf(2, ['B3'], ['booking.create', 'booking.delete', 'service.update', 'customer.update']),
  ),
  // Ko Aung — no grant; own earnings off.
  barber: me([]),
  // Unnamed — branch scope gives read-only (company level) or nothing (private level).
  'branch-holder': me(grantsOf(2, ['B3'], ['role.update', 'payroll.view'])),
};

export const {
  GrantsProvider: FixtureGrantsProvider,
  PermissionGate: FixturePermissionGate,
  useCan: useFixtureCan,
} = createGrants(FIXTURE_PERMISSIONS);
