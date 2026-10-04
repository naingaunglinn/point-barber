// Prisma 7 configuration (design D4.5). The CLI connects as the owner role through
// MIGRATE_DATABASE_URL — used only by db/scripts/migrate.mjs, introspection and the
// constraint-test runner. The API connects as point_app through DATABASE_URL (PR-C).
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'db/schema.prisma',
  migrations: {
    path: 'db/migrations',
  },
  datasource: {
    url: env('MIGRATE_DATABASE_URL'),
  },
});
