import { defineConfig, devices } from '@playwright/test';

import { APP_ORIGIN, SITE_ORIGIN } from './hosts.js';

// End-to-end tests against a running Compose stack (design D15 · D18): job e2e, or a developer's
// `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` + migrate. The two hosts are
// SITE_ORIGIN (public) and APP_ORIGIN (staff); fixtures.ts gives each spec a request context per host.
// One worker: edge.spec.ts stops and starts postgres, which every other test depends on.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  metadata: { siteOrigin: SITE_ORIGIN, appOrigin: APP_ORIGIN },
  use: {
    baseURL: APP_ORIGIN,
    // Caddy's local certificate authority is not trusted in CI or on a fresh machine (D12).
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
