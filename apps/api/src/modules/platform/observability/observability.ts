import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';

import { AppConfig } from '../../../common/config/config.js';
import { ErrorReporter } from '../../../common/observability/error-reporter.js';
import { startSentry } from './instrument.js';

// Starts error reporting when the application starts (add-staging-deploy design D9): with
// SENTRY_DSN_API set, the Sentry sink is plugged into the ErrorReporter; without it nothing is
// loaded. It runs before the first request is answered, and in the integration tests as in the API.
@Injectable()
export class Observability implements OnModuleInit, OnApplicationShutdown {
  constructor(
    private readonly config: AppConfig,
    private readonly reporter: ErrorReporter,
  ) {}

  async onModuleInit(): Promise<void> {
    const { SENTRY_DSN_API, APP_VERSION, APP_ENV } = this.config.env;
    if (SENTRY_DSN_API === undefined) return;
    this.reporter.use(
      await startSentry({ dsn: SENTRY_DSN_API, release: APP_VERSION, environment: APP_ENV }),
    );
  }

  /** Events still queued are sent before the process ends. */
  async onApplicationShutdown(): Promise<void> {
    await this.reporter.close();
  }
}
