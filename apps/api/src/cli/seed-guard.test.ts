import { describe, expect, it } from 'vitest';

import { assertSeedAllowed } from './seed-guard.js';

// add-foundation-auth-access task 3.6 — D-PLT-11 · spec-fixtures §9 · design D16: the development
// fixture never reaches production; `pnpm db:seed` refuses to run there.
describe('assertSeedAllowed (task 3.6)', () => {
  it('refuses APP_ENV=production', () => {
    expect(() => assertSeedAllowed('production')).toThrow(/refused in production/);
  });

  it.each(['development', 'test', 'staging'] as const)('allows %s', (appEnv) => {
    expect(() => assertSeedAllowed(appEnv)).not.toThrow();
  });
});
