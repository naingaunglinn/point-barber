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
import {
  AccessFixtureController,
  PublicApiFixtureController,
} from '../fixtures/access.controller.js';
import { AuditFixtureController } from '../fixtures/audit.controller.js';
import { ContextFixtureController } from '../fixtures/context.controller.js';
import { FixturesController } from '../fixtures/fixtures.controller.js';
import { IdempotentRowsFixtureController } from '../fixtures/idempotent-rows.controller.js';
import { UndeclaredFixtureController } from '../fixtures/undeclared.controller.js';

@Module({
  // The modules whose exports the fixture controllers inject (one instance each, shared with AppModule).
  imports: [AppModule, PlatformModule],
  controllers: [
    FixturesController,
    ContextFixtureController,
    AuditFixtureController,
    IdempotentRowsFixtureController,
    AccessFixtureController,
    PublicApiFixtureController,
    UndeclaredFixtureController,
  ],
})
class TestAppModule {}

/** A clock a test sets and moves; it never reads the machine's time. */
export class FixedClock extends Clock {
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

type Http = ReturnType<typeof supertest>;
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
type Requests = Pick<Http, (typeof METHODS)[number]>;

export interface TestApp {
  readonly app: NestExpressApplication;
  /**
   * Requests as the staff app sends them: `X-Requested-With: point-app` and the app's `Origin`,
   * which the CSRF guard requires on every changing request (API-AUTH-02).
   */
  readonly http: Requests;
  /** Requests with no header added — for the CSRF scenarios. */
  readonly raw: Http;
  /** The clock of the application when `now` was given. */
  readonly clock: FixedClock | undefined;
  /** Every JSON log line the API wrote. */
  readonly logs: Record<string, unknown>[];
  close(): Promise<void>;
}

export interface TestAppOptions {
  readonly now?: Date;
  readonly probe?: DatabaseProbe;
  /** Another database than DATABASE_URL — a fresh copy (helpers/databases.ts). */
  readonly databaseUrl?: string;
  /** JOBS_IN_API for this application: run the job workers (off by default in test:int). */
  readonly jobs?: boolean;
  /** Providers replaced for this application, e.g. a closed MaintenanceGate. */
  readonly overrides?: readonly { readonly provide: unknown; readonly useValue: unknown }[];
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
  const clock = options.now === undefined ? undefined : new FixedClock(options.now);
  if (clock !== undefined) builder = builder.overrideProvider(Clock).useValue(clock);
  if (options.probe !== undefined)
    builder = builder.overrideProvider(DatabaseProbe).useValue(options.probe);
  for (const override of options.overrides ?? []) {
    builder = builder.overrideProvider(override.provide).useValue(override.useValue);
  }
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
  await app.init();
  const raw = supertest(app.getHttpServer());
  const origin = app.get(AppConfig).env.APP_ORIGIN;
  const http = Object.fromEntries(
    METHODS.map((method) => [
      method,
      (url: string) => raw[method](url).set('X-Requested-With', 'point-app').set('Origin', origin),
    ]),
  ) as unknown as Requests;
  return {
    app,
    http,
    raw,
    clock,
    logs,
    close: () => app.close(),
  };
}
