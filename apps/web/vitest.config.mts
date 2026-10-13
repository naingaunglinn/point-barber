import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Unit tests of the web app (`pnpm test` at the root). The workspace packages are read from source
// through the `source` export condition, so no build is needed first.
export default defineConfig({
  resolve: { conditions: ['source', ...defaultServerConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  test: {
    name: 'web',
    environment: 'node',
  },
});
