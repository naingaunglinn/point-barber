// The one migrate entry point (design D4.6): `pnpm db:migrate`, the Compose `migrate`
// service, the CI jobs db / integration / e2e and the deploy runbook all run
// `node db/scripts/migrate.mjs`. It is an ordered list of steps; a later change that needs an
// owner-role step after the migrations appends it here and is picked up everywhere at once.
// Connects as the owner role through MIGRATE_DATABASE_URL.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PgBoss } from 'pg-boss';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');

// pg-boss (ADR-002 · add-foundation-auth-access design D9): its own schema, never `public` (still 91
// tables). The API starts pg-boss with schema creation and migration off, so role point_app needs
// no CREATE right — every queue is created here. A change that adds a queue adds it to QUEUES.
const PGBOSS_SCHEMA = 'pgboss';
const APP_ROLE = 'point_app';
const DAY = 86_400;
// ADR-002 job table: 3 retries for each of the three; completed jobs kept 30 days (action item 5).
const QUEUE_OPTIONS = { retryLimit: 3, retryBackoff: true, deleteAfterSeconds: 30 * DAY };
// add-walkin-visit-checkout design D10: the receipt render, 3 attempts in all (2 retries).
const QUEUES = {
  'email.send': QUEUE_OPTIONS,
  'auth.cleanup': QUEUE_OPTIONS,
  'sync.code_tables': QUEUE_OPTIONS,
  'receipt.render': { ...QUEUE_OPTIONS, retryLimit: 2 },
};

async function installPgBoss() {
  const boss = new PgBoss({
    connectionString: process.env.MIGRATE_DATABASE_URL,
    schema: PGBOSS_SCHEMA,
    max: 1,
    migrate: true,
    createSchema: true,
    supervise: false,
    schedule: false,
  });
  // An 'error' event without a listener would end the process without the step's message.
  boss.on('error', (error) => console.error(`migrate: pg-boss: ${error.message}`));
  await boss.start();
  try {
    const created = [];
    for (const [name, options] of Object.entries(QUEUES)) {
      if ((await boss.getQueue(name)) === null) {
        await boss.createQueue(name, options);
        created.push(name);
      }
    }
    const db = boss.getDb();
    for (const sql of [
      `GRANT USAGE ON SCHEMA ${PGBOSS_SCHEMA} TO ${APP_ROLE}`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${PGBOSS_SCHEMA} TO ${APP_ROLE}`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${PGBOSS_SCHEMA} TO ${APP_ROLE}`,
      `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${PGBOSS_SCHEMA} TO ${APP_ROLE}`,
      // Tables a later pg-boss migration adds get the same rights.
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${PGBOSS_SCHEMA} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${PGBOSS_SCHEMA} GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE}`,
    ]) {
      await db.executeSql(sql);
    }
    console.log(
      `migrate: pg-boss schema ${PGBOSS_SCHEMA} v${await boss.schemaVersion()} · queues created: ${
        created.length === 0 ? 'none' : created.join(', ')
      } · rights granted to ${APP_ROLE}`,
    );
  } finally {
    await boss.stop({ graceful: false });
  }
}

const steps = [
  {
    name: 'prisma migrate deploy',
    run: () =>
      spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
        cwd: root,
        stdio: 'inherit',
      }).status,
  },
  {
    name: 'pg-boss install, queues and grants',
    run: async () => {
      try {
        await installPgBoss();
        return 0;
      } catch (error) {
        // The message only: a connection error can carry the connection string.
        console.error(`migrate: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
    },
  },
];

if (!process.env.MIGRATE_DATABASE_URL) {
  console.error('migrate: MIGRATE_DATABASE_URL is required (owner role connection)');
  process.exit(1);
}
for (const step of steps) {
  console.log(`migrate: ${step.name}`);
  const status = await step.run();
  if (status !== 0) {
    console.error(`migrate: step "${step.name}" failed`);
    process.exit(status ?? 1);
  }
}
console.log(`migrate: ${steps.length} step(s) done`);
