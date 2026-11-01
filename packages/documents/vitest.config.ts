import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// Unit tests of the document templates (`pnpm test` at the root): @point/shared and @point/i18n are read
// from source through the `source` export condition, so no build is needed first. Node's conditions,
// not Vite's client ones: the templates render on the server.
const conditions = ['source', ...defaultServerConditions.filter((name) => name !== 'module')];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    name: '@point/documents',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
