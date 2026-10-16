import type { ApiEnv } from '../common/config/env.schema.js';

// The development fixture never reaches production (D-PLT-11 · spec-fixtures §9 · design D16).
export function assertSeedAllowed(appEnv: ApiEnv['APP_ENV']): void {
  if (appEnv === 'production') {
    throw new Error(
      'db:seed is refused in production (APP_ENV=production): fixtures are test data',
    );
  }
}
