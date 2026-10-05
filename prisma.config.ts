// Prisma 7 configuration (design D4.5). The CLI connects as the owner role through
// MIGRATE_DATABASE_URL — used only by db/scripts/migrate.mjs, introspection and the
// constraint-test runner. The API connects as point_app through DATABASE_URL (PR-C).
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'db/schema.prisma',
  migrations: {
    path: 'db/migrations',
  },
  // Not env(): that helper throws while the config loads, which would stop `prisma generate` where
  // no owner URL exists by design (CI typecheck, the API image's build stage). migrate, pull and the
  // db scripts check the URL themselves.
  datasource: {
    url: process.env.MIGRATE_DATABASE_URL,
  },
});
