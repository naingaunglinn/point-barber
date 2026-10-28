import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PERMISSIONS, type PermissionEntry } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import { runSeed } from '../../src/cli/run-seed.js';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import { TransactionRunner } from '../../src/common/database/transaction-runner.js';
import { PermissionCatalogue } from '../../src/modules/people/index.js';
import { type FreshDatabase, freshDatabase } from './databases.js';
import { cookieOf, openSession } from './people.js';
import { type TestApp, type TestAppOptions, startTestApp } from './test-app.js';

// The people of docs/plan/spec-fixtures.md §2 on a fresh database (design D16): the base seed and the
// fixture modules of `pnpm db:seed`, then the test catalogue — permissions.json plus the three fixture
// codes of design D11 that no Part 1 code covers (levels `view` at branch level, `shared`, `private`).
// The catalogue sync gives every new code to the company-admin role, so U Kyaw Zin holds them.

const FIXTURES = join(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'),
  'db/seed/fixtures',
);

const fixtureEntry = (action: string, level: PermissionEntry['level']): PermissionEntry => ({
  code: `fixture.${action}`,
  module: 'fixture',
  action,
  kind: 'crud',
  level,
  label_key: `permission.fixture.${action}`,
  description: `fixture · ${action} — integration tests only`,
});

export const FIXTURE_PERMISSIONS: readonly PermissionEntry[] = [
  fixtureEntry('view', 'branch'),
  fixtureEntry('shared_view', 'shared'),
  fixtureEntry('private_view', 'private'),
];

export type FixturePerson = keyof typeof FIXTURE_IDS.employees;

export interface SeededApp extends TestApp {
  readonly prisma: PrismaService;
  /** A new session of the fixture person; the Cookie header that carries it. */
  signIn(
    person: FixturePerson,
    options?: { readonly at?: Date },
  ): Promise<{ readonly sessionId: string; readonly token: string; readonly cookie: string }>;
}

export async function startSeededApp(
  options: Omit<TestAppOptions, 'databaseUrl'> = {},
): Promise<SeededApp> {
  const db: FreshDatabase = await freshDatabase();
  const t = await startTestApp({ ...options, databaseUrl: db.url });
  await runSeed(t.app, FIXTURES);
  await t.app
    .get(TransactionRunner)
    .run((tx) => t.app.get(PermissionCatalogue).sync(tx, [...PERMISSIONS, ...FIXTURE_PERMISSIONS]));
  const prisma = t.app.get(PrismaService);
  return {
    ...t,
    prisma,
    async signIn(person, signInOptions = {}) {
      const at = signInOptions.at ?? t.clock?.now();
      const session = await openSession(
        prisma,
        FIXTURE_IDS.users[person],
        at === undefined ? {} : { at },
      );
      return { ...session, cookie: cookieOf(session.token) };
    },
    async close() {
      await t.close();
      await db.drop();
    },
  };
}
