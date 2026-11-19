import 'reflect-metadata';

import { userInfo } from 'node:os';
import { text } from 'node:stream/consumers';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { withoutJobWorkers } from '../common/config/config.js';
import { pilotSeed } from './pilot-seed-command.js';

// The pilot data seed (add-pilot-data-seed design D1 · docs/ops/pilot-data-seed.md), on the server:
//   docker compose exec -T api node dist/cli/pilot-seed.js [--apply] < /path/on/server/pilot-data.json
// From source: `pnpm pilot:seed [-- --apply] < file`. An application context without an HTTP listener
// and without job workers, like admin-create.
async function main(): Promise<number> {
  if (process.stdin.isTTY) {
    process.stderr.write(
      'pilot-seed: give the file on standard input: … pilot-seed.js < pilot-data.json\n',
    );
    return 1;
  }
  const input = await text(process.stdin);
  withoutJobWorkers();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await pilotSeed(app, process.argv.slice(2), input, userInfo().username);
    for (const line of result.stdout) process.stdout.write(`${line}\n`);
    for (const line of result.stderr) process.stderr.write(`${line}\n`);
    return result.status;
  } finally {
    await app.close();
  }
}

main().then(
  (status) => {
    process.exitCode = status;
  },
  (error: unknown) => {
    process.stderr.write(`pilot-seed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
