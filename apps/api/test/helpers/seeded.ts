import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSeed } from '../../src/cli/run-seed.js';
import { type FreshDatabase, freshDatabase } from './databases.js';
import type { Clock } from '../../src/common/clock/clock.js';
import { type TestApp, type TestAppOptions, startTestApp } from './test-app.js';

// add-walkin-visit-checkout — a fresh database with the base seed and every fixture module
// (spec-fixtures — B3, Ko Aung, Ko Min, Haircut 8,000 / 10,000 …), so a walk-in test starts from the
// scenario data and never meets another test file's rows. The clock is fixed at `now`.
const FIXTURES = join(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'),
  'db/seed/fixtures',
);

export interface SeededApp extends TestApp {
  readonly db: FreshDatabase;
}

export async function seededApp(
  now: Date | Clock,
  options: Pick<TestAppOptions, 'overrides' | 'jobs'> = {},
): Promise<SeededApp> {
  const db = await freshDatabase();
  const t = await startTestApp(
    now instanceof Date
      ? { ...options, databaseUrl: db.url, now }
      : { ...options, databaseUrl: db.url, clock: now },
  );
  await runSeed(t.app, FIXTURES);
  return {
    ...t,
    db,
    close: async () => {
      await t.close();
      await db.drop();
    },
  };
}
