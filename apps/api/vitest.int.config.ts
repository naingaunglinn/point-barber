import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// API integration tests (`pnpm test:int`): the real Nest application on a real PostgreSQL 16 with
// the repository's migrations, connected as point_app (CG-TEST-04 · design D15). DATABASE_URL comes
// from the environment (CI job `integration`, or the developer's .env); the other variables are the
// local fixtures of the spec.

// Node's conditions, not Vite's: Vite adds `module`, which Node never reads, and @opentelemetry/api
// (a pg-boss peer) maps `module` to a build whose imports have no file extensions.
const conditions = ['source', ...defaultServerConditions.filter((name) => name !== 'module')];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    name: 'api-integration',
    include: ['test/**/*.int.test.ts'],
    environment: 'node',
    fileParallelism: false,
    // point_it_template, copied by the tests that need a fresh database (test/helpers/databases.ts).
    globalSetup: ['test/helpers/global-setup.ts'],
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
      // add-foundation-auth-access — design D18. Test values only; SMTP_HOST is overridden by the
      // CI job `integration`, which runs a mailpit service (task 2.10).
      APP_ENV: 'test',
      OTP_HMAC_SECRET: 'h'.repeat(32),
      AUDIT_HASH_SECRET: 'a'.repeat(32),
      MAIL_PAYLOAD_KEY: Buffer.alloc(32, 7).toString('base64'),
      MAIL_TRANSPORT: 'mailpit',
      MAIL_FROM: 'Point Barbershop <no-reply@point.test>',
      SMTP_HOST: process.env.SMTP_HOST ?? 'localhost',
      GOOGLE_CLIENT_ID: 'point-test-client',
      GOOGLE_CLIENT_SECRET: 'point-test-secret',
      COMPANY_NAME_MM: 'ပွိုင့် ဘာဘာရှော့',
      COMPANY_NAME_EN: 'Point Barbershop',
      // No job workers or pg-boss maintenance in the test applications: sending still works, and the
      // tests that need workers switch them on (test/jobs.int.test.ts).
      JOBS_IN_API: 'false',
    },
  },
});
