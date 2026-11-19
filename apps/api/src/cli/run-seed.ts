import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { INestApplicationContext } from '@nestjs/common';

import { TransactionRunner } from '../common/database/transaction-runner.js';
import { CurrentCompany } from '../modules/people/index.js';
import { CodeTables } from '../modules/platform/index.js';

// `pnpm db:seed` (D-PLT-11 · spec-fixtures §9 · add-foundation-auth-access design D16): the base seed —
// the steps of sync.code_tables — then the numbered fixture modules of db/seed/fixtures in order, in
// one transaction. Each module upserts rows with the fixed ids of packages/shared/src/testing, so a
// second run changes no row count. The modules live outside the API build and never reach the image.

export interface FixtureDb {
  query(sql: string, values: readonly unknown[]): Promise<unknown>;
  rows(sql: string, values: readonly unknown[]): Promise<Record<string, unknown>[]>;
}

interface FixtureModule {
  seed(db: FixtureDb, context: { companyId: string }): Promise<void>;
}

/** The fixture modules of `dir`: `NNN-name.mjs`, in name order. */
function fixtureFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => /^\d{3}-[a-z0-9-]+\.mjs$/.test(name))
    .sort()
    .map((name) => join(dir, name));
}

export async function runSeed(
  app: INestApplicationContext,
  fixturesDir: string,
): Promise<string[]> {
  await app.get(CodeTables).runAll();
  const files = fixtureFiles(fixturesDir);
  const modules = await Promise.all(
    files.map(async (file) => (await import(pathToFileURL(file).href)) as FixtureModule),
  );
  await app.get(TransactionRunner).run(async (tx) => {
    const companyId = await app.get(CurrentCompany).id(tx);
    const db: FixtureDb = {
      query: (sql, values) => tx.$executeRawUnsafe(sql, ...values),
      rows: (sql, values) => tx.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...values),
    };
    for (const module of modules) await module.seed(db, { companyId });
  });
  return files;
}
