import 'reflect-metadata';

import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap.js';
import { Clock } from '../../src/common/clock/clock.js';
import { AppConfig, loadAppConfig } from '../../src/common/config/config.js';
import { DatabaseProbe } from '../../src/common/database/prisma.service.js';
import { LOGGER, createLogger } from '../../src/common/logging/logger.js';
import { PlatformModule } from '../../src/modules/platform/index.js';
import { AuditFixtureController } from '../fixtures/audit.controller.js';
import { ContextFixtureController } from '../fixtures/context.controller.js';
import { FixturesController } from '../fixtures/fixtures.controller.js';
import { IdempotentRowsFixtureController } from '../fixtures/idempotent-rows.controller.js';
import { fixtureActorMiddleware } from './fixture-actor.js';

@Module({
  // The modules whose exports the fixture controllers inject (one instance each, shared with AppModule).
  imports: [AppModule, PlatformModule],
  controllers: [
    FixturesController,
    ContextFixtureController,
    AuditFixtureController,
    IdempotentRowsFixtureController,
  ],
})
class TestAppModule {}

export class FixedClock extends Clock {
  constructor(private readonly instant: Date) {
    super();
  }
  override now(): Date {
    return this.instant;
  }
}

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly http: ReturnType<typeof supertest>;
  /** Every JSON log line the API wrote. */
  readonly logs: Record<string, unknown>[];
  close(): Promise<void>;
}

/** A clock a test moves (add-walkin-visit-checkout — month boundary, a visit across midnight). */
export class MovableClock extends Clock {
  constructor(private instant: Date) {
    super();
  }
  override now(): Date {
    return this.instant;
  }
  set(instant: Date): void {
    this.instant = instant;
  }
}

export interface TestAppOptions {
  readonly now?: Date;
  /** A clock of the test's own, instead of the fixed one of `now`. */
  readonly clock?: Clock;
  readonly probe?: DatabaseProbe;
  /** Another database than DATABASE_URL — a fresh copy (helpers/databases.ts). */
  readonly databaseUrl?: string;
  /** JOBS_IN_API for this application: run the job workers (off by default in test:int). */
  readonly jobs?: boolean;
}

/** The real application (guards, pipes, filter, middleware) with the fixture endpoints added. */
export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  if (process.env.DATABASE_URL === undefined) {
    throw new Error(
      'DATABASE_URL (point_app on a migrated PostgreSQL 16) is required for test:int',
    );
  }
  const logs: Record<string, unknown>[] = [];
  const stream = {
    write(line: string): void {
      logs.push(JSON.parse(line) as Record<string, unknown>);
    },
  };
  let builder = Test.createTestingModule({ imports: [TestAppModule] })
    .overrideProvider(LOGGER)
    .useValue(createLogger('info', stream));
  if (options.clock !== undefined)
    builder = builder.overrideProvider(Clock).useValue(options.clock);
  else if (options.now !== undefined)
    builder = builder.overrideProvider(Clock).useValue(new FixedClock(options.now));
  if (options.probe !== undefined)
    builder = builder.overrideProvider(DatabaseProbe).useValue(options.probe);
  if (options.databaseUrl !== undefined || options.jobs !== undefined) {
    const { env } = loadAppConfig();
    const config: AppConfig = {
      env: {
        ...env,
        DATABASE_URL: options.databaseUrl ?? env.DATABASE_URL,
        JOBS_IN_API: options.jobs ?? env.JOBS_IN_API,
      },
    };
    builder = builder.overrideProvider(AppConfig).useValue(config);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  app.use(fixtureActorMiddleware);
  await app.init();
  return {
    app,
    http: supertest(app.getHttpServer()),
    logs,
    close: () => app.close(),
  };
}
