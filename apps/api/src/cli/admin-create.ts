import 'reflect-metadata';

import { userInfo } from 'node:os';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { withoutJobWorkers } from '../common/config/config.js';
import { adminCreate } from './admin-create-command.js';

// The operator command of P1-RULE-14 (design D10), on the server:
//   docker compose exec api node dist/cli/admin-create.js --email … --name-mm … --code … [--name-en …]
// From source: `pnpm admin:create -- --email …`. An application context without an HTTP listener and
// without job workers. Exit 0 with one line on stdout, or 1 with one line on stderr.
async function main(): Promise<number> {
  withoutJobWorkers();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await adminCreate(app, process.argv.slice(2), userInfo().username);
    (result.status === 0 ? process.stdout : process.stderr).write(`${result.message}\n`);
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
    process.stderr.write(
      `admin-create: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  },
);
