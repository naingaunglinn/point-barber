import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PgBoss, type SendOptions, type WorkOptions, fromPrisma } from 'pg-boss';
import type { Logger } from 'pino';

import { AppConfig } from '../../../common/config/config.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { LOGGER } from '../../../common/logging/logger.js';

// Background jobs on pg-boss (ADR-002 · add-foundation-auth-access design D3 · D9). The one folder
// that imports pg-boss (CG-ARCH-08). Schema `pgboss` and the queues are created by the owner-role
// step of db/scripts/migrate.mjs; the API starts pg-boss with schema creation and migration off, as
// role point_app. A job is sent inside the caller's transaction — `send(tx, …)` binds pg-boss's
// `db` executor to the Prisma transaction — so a rolled-back transaction leaves no job. The workers
// run in this process when JOBS_IN_API=true (the default), and stop with it.

export type JobHandler<T> = (data: T, job: { readonly id: string }) => Promise<void>;
export type JobSendOptions = Omit<SendOptions, 'db'>;

export const PGBOSS_SCHEMA = 'pgboss';

interface Registration {
  readonly name: string;
  readonly handler: JobHandler<never>;
  readonly options: WorkOptions;
}

@Injectable()
export class Jobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly boss: PgBoss;
  private readonly registrations: Registration[] = [];
  private readonly atStart: { name: string; data: object; options: JobSendOptions }[] = [];
  private readonly schedules: { name: string; cron: string }[] = [];
  private started = false;

  constructor(
    private readonly config: AppConfig,
    @Inject(LOGGER) private readonly log: Logger,
  ) {
    const workers = config.env.JOBS_IN_API;
    this.boss = new PgBoss({
      connectionString: config.env.DATABASE_URL,
      schema: PGBOSS_SCHEMA,
      max: 4,
      migrate: false,
      createSchema: false,
      // Maintenance (expiry, deletion) and cron run where the workers run.
      supervise: workers,
      schedule: workers,
    });
    // pg-boss reports problems as events; an unhandled 'error' event would end the process.
    this.boss.on('error', (err) => this.log.error({ err }, 'pg-boss error'));
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start();
    if ((await this.boss.schemaVersion()) === null) {
      throw new Error(
        `pg-boss schema ${PGBOSS_SCHEMA} is missing — run node db/scripts/migrate.mjs first`,
      );
    }
    this.started = true;
    for (const registration of this.registrations) await this.startWorker(registration);
    for (const { name, data, options } of this.atStart) await this.boss.send(name, data, options);
    // Cron runs where the workers run (ADR-002); Myanmar Time.
    if (this.config.env.JOBS_IN_API) {
      for (const { name, cron } of this.schedules) {
        await this.boss.schedule(name, cron, {}, { tz: 'Asia/Yangon' });
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.started) await this.boss.stop({ graceful: true, timeout: 10_000 });
  }

  /** Queues a job in the caller's transaction (design D3): no job exists if `tx` rolls back. */
  async send<T extends object>(
    tx: Tx,
    name: string,
    data: T,
    options: JobSendOptions = {},
  ): Promise<string | null> {
    return this.boss.send(name, data, { ...options, db: fromPrisma(tx) });
  }

  /**
   * Queues a job once pg-boss has started, at every API start (`sync.code_tables` — ADR-002). Not
   * part of a business transaction, so no `tx`.
   */
  sendAtStart<T extends object>(name: string, data: T, options: JobSendOptions = {}): void {
    this.atStart.push({ name, data, options });
  }

  /** A recurring job on a cron pattern (`auth.cleanup` hourly — ADR-002); set at start-up. */
  schedule(name: string, cron: string): void {
    this.schedules.push({ name, cron });
  }

  /** Handles a queue in this process when JOBS_IN_API=true; each job's data reaches `handler`. */
  register<T>(name: string, handler: JobHandler<T>, options: WorkOptions = {}): void {
    const registration: Registration = {
      name,
      handler: handler as JobHandler<never>,
      options,
    };
    this.registrations.push(registration);
    if (this.started) {
      this.startWorker(registration).catch((err: unknown) => {
        this.log.error({ err, queue: name }, 'job worker failed to start');
      });
    }
  }

  private async startWorker({ name, handler, options }: Registration): Promise<void> {
    if (!this.config.env.JOBS_IN_API) return;
    await this.boss.work<never>(name, { ...options, batchSize: 1 }, async ([job]) => {
      if (job !== undefined) await handler(job.data, { id: job.id });
    });
  }
}
