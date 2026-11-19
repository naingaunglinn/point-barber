import { defineConfig } from 'vitest/config';

// The e2e workspace's unit tests (helpers). The *.spec.ts files are Playwright's and run with
// `pnpm e2e` against a stack, never under Vitest.
export default defineConfig({
  test: {
    name: 'e2e',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
  },
});
