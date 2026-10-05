import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// API integration tests (`pnpm test:int`): the real Nest application on a real PostgreSQL 16 with
// the repository's migrations, connected as point_app (CG-TEST-04 · design D15). DATABASE_URL comes
// from the environment (CI job `integration`, or the developer's .env); the other variables are the
// local fixtures of the spec.
export default defineConfig({
  resolve: { conditions: ['source', ...defaultServerConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  test: {
    name: 'api-integration',
    include: ['test/**/*.int.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    env: {
      SITE_ORIGIN: 'https://point.test',
      APP_ORIGIN: 'https://app.point.test',
      API_PORT: '3001',
      LOG_LEVEL: 'info',
      INTERNAL_SSR_KEY: 's'.repeat(16),
      INTERNAL_OPS_KEY: 'o'.repeat(16),
      APP_VERSION: '0.1.0',
    },
  },
});
