'use client';

import { createGrants } from '../permissions/grants';
import { FIXTURE_PERMISSIONS } from './personas';

// GrantsProvider, PermissionGate and useCan bound to the fixture catalogue. createGrants creates a
// React context, so it is called in a client module; personas.ts stays plain data for the server page.
export const {
  GrantsProvider: FixtureGrantsProvider,
  PermissionGate: FixturePermissionGate,
  useCan: useFixtureCan,
} = createGrants(FIXTURE_PERMISSIONS);
