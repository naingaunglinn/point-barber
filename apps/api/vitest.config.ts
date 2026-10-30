import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Unit tests of the API (`pnpm test` at the root). @point/shared is read from source through the
// `source` export condition, so no build is needed first.

// Node's conditions, not Vite's: Vite adds `module`, which Node never reads, and @opentelemetry/api
// (a pg-boss peer) maps `module` to a build whose imports have no file extensions.
const conditions = ['source', ...defaultServerConditions.filter((name) => name !== 'module')];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    name: 'api',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
