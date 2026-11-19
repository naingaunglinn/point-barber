import { PrismaService } from '../../src/common/database/prisma.service.js';

// The fixture table of the idempotency tests (add-foundation-auth-access design D14 · platform-runtime
// spec): schema `fixtures`, created by the test set-up through the owner connection — never by a
// migration, and role point_app cannot create a schema. Idempotent: safe in every test run.
export async function ensureIdempotentRowsTable(): Promise<void> {
  const url = process.env.MIGRATE_DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'MIGRATE_DATABASE_URL (the owner role) is required to create the fixtures schema',
    );
  }
  const owner = new PrismaService({ env: { DATABASE_URL: url } } as never);
  try {
    for (const sql of [
      'CREATE SCHEMA IF NOT EXISTS fixtures',
      `CREATE TABLE IF NOT EXISTS fixtures.idempotent_rows (
         id uuid PRIMARY KEY,
         client_request_id uuid NOT NULL,
         branch_id uuid NOT NULL,
         amount integer NOT NULL,
         note text,
         created_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT idempotent_rows_client_request_id_key UNIQUE (client_request_id)
       )`,
      'GRANT USAGE ON SCHEMA fixtures TO point_app',
      'GRANT SELECT, INSERT ON fixtures.idempotent_rows TO point_app',
    ]) {
      await owner.$executeRawUnsafe(sql);
    }
  } finally {
    await owner.$disconnect();
  }
}
