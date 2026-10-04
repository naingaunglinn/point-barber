import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { AppConfig } from './common/config/config.js';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(app.get(AppConfig).env.API_PORT, '0.0.0.0');
}

main().catch((error: unknown) => {
  // A start-up failure (environment, database time zone) ends the process with one fatal line.
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify({ level: 'fatal', msg: 'api start failed', error: message })}\n`,
  );
  process.exit(1);
});
