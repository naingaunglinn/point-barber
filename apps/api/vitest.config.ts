import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Unit tests of the API (`pnpm test` at the root). @point/shared is read from source through the
// `source` export condition, so no build is needed first.
export default defineConfig({
  resolve: { conditions: ['source', ...defaultServerConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  test: {
    name: 'api',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
