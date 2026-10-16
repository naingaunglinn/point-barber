import 'reflect-metadata';

import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { loadAppConfig, withoutJobWorkers } from '../common/config/config.js';
import { assertSeedAllowed } from './seed-guard.js';
import { runSeed } from './run-seed.js';

// `pnpm db:seed` — run from the repository root (D-PLT-11 · design D16): refused when
// APP_ENV=production, before anything touches the database. An application context without an HTTP
// listener and without job workers; the fixtures come from db/seed/fixtures of the working copy.
async function main(): Promise<number> {
  assertSeedAllowed(loadAppConfig().env.APP_ENV);
  withoutJobWorkers();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const files = await runSeed(app, resolve(process.cwd(), 'db/seed/fixtures'));
    process.stdout.write(`db:seed: base seed and ${files.length} fixture module(s) done\n`);
    return 0;
  } finally {
    await app.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`db:seed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
