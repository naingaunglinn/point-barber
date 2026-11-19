import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../src/common/database/prisma.service.js';

// Fresh databases for the integration tests that need one ("on a freshly migrated database" — the
// first start, the base seed, the first-admin command): a copy of point_it_template, which
// global-setup.ts migrates once per run through the one migrate entry point. Created and dropped
// through the owner connection (MIGRATE_DATABASE_URL); the API under test connects as point_app.

export const TEMPLATE_DATABASE = 'point_it_template';

export function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

function ownerUrl(): string {
  const url = process.env.MIGRATE_DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('MIGRATE_DATABASE_URL (the owner role) is required for a fresh test database');
  }
  return url;
}

/** Runs statements on the server's `postgres` database as the owner role. */
export async function asOwner(statements: readonly string[]): Promise<void> {
  const admin = new PrismaService({
    env: { DATABASE_URL: withDatabase(ownerUrl(), 'postgres') },
  } as never);
  try {
    for (const sql of statements) await admin.$executeRawUnsafe(sql);
  } finally {
    await admin.$disconnect();
  }
}

export interface FreshDatabase {
  /** point_app's connection to the copy. */
  readonly url: string;
  /** The owner's connection to the copy (MIGRATE_DATABASE_URL form). */
  readonly ownerUrl: string;
  drop(): Promise<void>;
}

/** A new copy of the migrated template; drop() removes it. */
export async function freshDatabase(): Promise<FreshDatabase> {
  const name = `point_it_${randomBytes(4).toString('hex')}`;
  await asOwner([`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DATABASE}`]);
  const appUrl = process.env.DATABASE_URL ?? '';
  return {
    url: withDatabase(appUrl, name),
    ownerUrl: withDatabase(ownerUrl(), name),
    drop: () => asOwner([`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`]),
  };
}
