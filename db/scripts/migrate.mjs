// The one migrate entry point (design D4.6): `pnpm db:migrate`, the Compose `migrate`
// service, the CI jobs db / integration / e2e and the deploy runbook all run
// `node db/scripts/migrate.mjs`. It is an ordered list of steps; a later change that needs an
// owner-role step after the migrations appends it here and is picked up everywhere at once.
// Connects as the owner role through MIGRATE_DATABASE_URL.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');

const steps = [
  {
    name: 'prisma migrate deploy',
    run: () =>
      spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
        cwd: root,
        stdio: 'inherit',
      }),
  },
];

if (!process.env.MIGRATE_DATABASE_URL) {
  console.error('migrate: MIGRATE_DATABASE_URL is required (owner role connection)');
  process.exit(1);
}
for (const step of steps) {
  console.log(`migrate: ${step.name}`);
  const result = step.run();
  if (result.status !== 0) {
    console.error(`migrate: step "${step.name}" failed`);
    process.exit(result.status ?? 1);
  }
}
console.log(`migrate: ${steps.length} step(s) done`);
