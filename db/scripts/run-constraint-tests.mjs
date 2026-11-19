// pnpm db:test — runs every db/source/*-test.sql on its own freshly migrated PostgreSQL 16
// database (design D4.9): point_template is created and migrated once through the migrate
// entry point; each file gets a copy of it, runs with PGTZ=Asia/Yangon (ALTER DATABASE … SET
// is not copied by CREATE DATABASE … TEMPLATE — D4.7), and is dropped afterwards.
// Connection: MIGRATE_DATABASE_URL (owner role); its database name is not used.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { psql, scalar, withDatabase } from './lib/pg.mjs';
import { SEP, evaluate } from './lib/results.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ownerUrl = process.env.MIGRATE_DATABASE_URL;
if (!ownerUrl) {
  console.error('db:test: MIGRATE_DATABASE_URL is required (owner role connection)');
  process.exit(1);
}
const admin = withDatabase(ownerUrl, 'postgres');
const template = 'point_template';
const files = readdirSync(join(root, 'db', 'source'))
  .filter((f) => f.endsWith('-test.sql'))
  .sort();

function recreate(name, fromTemplate) {
  scalar(admin, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  scalar(
    admin,
    fromTemplate ? `CREATE DATABASE ${name} TEMPLATE ${fromTemplate}` : `CREATE DATABASE ${name}`,
  );
}

recreate(template);
const migrated = spawnSync(process.execPath, [join(root, 'db', 'scripts', 'migrate.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, MIGRATE_DATABASE_URL: withDatabase(ownerUrl, template) },
});
if (migrated.status !== 0) {
  console.error('db:test: migrating the template failed');
  process.exit(1);
}

let failed = 0;
let total = 0;
files.forEach((file, i) => {
  const db = `point_test_${i + 1}`;
  recreate(db, template);
  const run = psql(
    withDatabase(ownerUrl, db),
    ['-At', '-0', '-F', SEP, '-f', join(root, 'db', 'source', file)],
    {
      PGTZ: 'Asia/Yangon',
    },
  );
  scalar(admin, `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  const result = evaluate(file, run.stdout);
  if (run.status !== 0)
    result.messages.push(`${file}: psql exited ${run.status}\n${run.stderr.trim()}`);
  total += result.cases;
  if (run.status !== 0 || !result.ok) {
    failed += 1;
    for (const m of result.messages) console.error(`db:test: ${m}`);
  } else {
    console.log(`db:test: ${file} — ${result.cases} PASS`);
  }
});
scalar(admin, `DROP DATABASE IF EXISTS ${template} WITH (FORCE)`);
console.log(`db:test: ${files.length} file(s), ${total} case(s), ${failed} file(s) failed`);
process.exit(failed === 0 ? 0 : 1);
