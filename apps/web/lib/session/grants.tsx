'use client';

import { LEVEL_BY_CODE } from '@point/shared';
import { createGrants } from '@point/ui';

// The staff app's grants, bound once to the real permission catalogue (add-shared-ui-components
// design D7 · add-foundation-auth-access D17): createGrants makes a React context, so it runs in this
// one 'use client' module. Its `useMe` (the `/me` slice the provider holds) is exported as
// `useGrantsMe`, so it does not clash with the session layer's `useMe()` query.
const bound = createGrants(LEVEL_BY_CODE);

export const GrantsProvider = bound.GrantsProvider;
export const PermissionGate = bound.PermissionGate;
export const useCan = bound.useCan;
export const useGrantsMe = bound.useMe;
