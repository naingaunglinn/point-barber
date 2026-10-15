import { defineConfig, devices } from '@playwright/test';

import { IS_CI } from '../hosts.js';
import type { CatalogueOptions } from './fixtures.js';
import { CATALOGUE_APP_ORIGIN, CATALOGUE_SITE_ORIGIN } from './origins.js';

// Playwright on the component catalogue `/dev/ui` (add-shared-ui-components design D13 · AD-QA-01):
// the catalogue build served by `next start` alone — no API, no database. CI job `catalogue` builds it
// with `pnpm --filter web build:catalogue` first; locally a running catalogue on port 3100 is reused.
//   pnpm --filter e2e e2e:catalogue

const desktop = devices['Desktop Chrome'];
const at = (width: number) => ({ ...desktop, viewport: { width, height: 900 } });

// Files that only their own project runs.
const LAYOUT = 'layout.spec.ts';
const ZONE = 'zone.spec.ts';
const REDUCED_MOTION = 'reduced-motion.spec.ts';
const TARGETS = 'targets.spec.ts';

export default defineConfig<CatalogueOptions>({
  testDir: '.',
  testMatch: '*.spec.ts',
  forbidOnly: IS_CI,
  retries: 0,
  timeout: 60_000,
  reporter: IS_CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: CATALOGUE_APP_ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [
    // Every spec, in both languages at the two widths of AD-QA-01.
    ...(['my', 'en'] as const).flatMap((lang) =>
      [320, 1280].map((width) => ({
        name: `${lang}-${width}`,
        testIgnore: [ZONE, REDUCED_MOTION],
        use: { ...at(width), lang },
      })),
    ),
    // The components whose layout changes at 768 px, on a small phone and a tablet.
    ...(['my', 'en'] as const).flatMap((lang) =>
      [360, 768].map((width) => ({
        name: `${lang}-${width}`,
        testMatch: LAYOUT,
        use: { ...at(width), lang },
      })),
    ),
    // A phone in Los Angeles whose clock says 2020: the catalogue clock alone decides "today"
    // (D-PLT-15 · CG-TIME-04).
    {
      name: 'foreign-zone',
      testMatch: ZONE,
      use: {
        ...at(1280),
        lang: 'en',
        timezoneId: 'America/Los_Angeles',
        deviceDate: '2020-01-01T20:00:00Z', // 12:00 on 01/Jan/2020 in Los Angeles
      },
    },
    {
      name: 'reduced-motion',
      testMatch: REDUCED_MOTION,
      use: { ...at(1280), lang: 'en', reducedMotion: 'reduce' },
    },
    // 1280 px at 200 % zoom (AD-A11Y-05).
    {
      name: 'zoom-200',
      testMatch: TARGETS,
      use: { ...desktop, viewport: { width: 640, height: 450 }, deviceScaleFactor: 2, lang: 'my' },
    },
  ],
  webServer: {
    command: 'node_modules/.bin/next start --port 3100',
    cwd: '../../apps/web',
    url: `${CATALOGUE_APP_ORIGIN}/dev/ui`,
    reuseExistingServer: !IS_CI,
    timeout: 120_000,
    // apps/web/env.ts validates all four on the first request. No API runs in this setup: the two
    // API values only satisfy the schema, and the catalogue calls neither (11.18).
    env: {
      APP_ORIGIN: CATALOGUE_APP_ORIGIN,
      SITE_ORIGIN: CATALOGUE_SITE_ORIGIN,
      NEXT_PUBLIC_API_BASE: '/api/v1',
      API_INTERNAL_BASE: 'http://localhost:3001/api/v1',
    },
  },
});
