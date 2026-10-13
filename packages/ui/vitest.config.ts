import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Unit and component tests of the shared UI (`pnpm test` at the root): Vitest + Testing Library on
// jsdom (design D13). @point/shared and @point/i18n are read from source through the `source` export
// condition, so no build is needed first.
export default defineConfig({
  resolve: { conditions: ['source', ...defaultClientConditions] },
  test: {
    name: '@point/ui',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
