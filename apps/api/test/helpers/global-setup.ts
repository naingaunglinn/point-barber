import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEMPLATE_DATABASE, asOwner, withDatabase } from './databases.js';

// Vitest global set-up of `pnpm test:int`: point_it_template — a database migrated through the one
// migrate entry point (db/scripts/migrate.mjs: the baseline and pg-boss) — from which each test that
// needs a fresh database takes a copy (helpers/databases.ts). Without MIGRATE_DATABASE_URL nothing is
// prepared, and only those tests fail, with a message that names the variable.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export default async function setup(): Promise<void> {
  const owner = process.env.MIGRATE_DATABASE_URL;
  if (owner === undefined || owner === '') return;
  await asOwner([
    `DROP DATABASE IF EXISTS ${TEMPLATE_DATABASE} WITH (FORCE)`,
    `CREATE DATABASE ${TEMPLATE_DATABASE}`,
  ]);
  const migrated = spawnSync(process.execPath, [join(root, 'db/scripts/migrate.mjs')], {
    cwd: root,
    env: { ...process.env, MIGRATE_DATABASE_URL: withDatabase(owner, TEMPLATE_DATABASE) },
    encoding: 'utf8',
  });
  if (migrated.status !== 0) {
    throw new Error(`migrating ${TEMPLATE_DATABASE} failed:\n${migrated.stderr}`);
  }
}
