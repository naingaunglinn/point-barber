import { Global, Module } from '@nestjs/common';
import type { Logger } from 'pino';

import { Clock, SystemClock } from './clock/clock.js';
import { AppConfig, loadAppConfig } from './config/config.js';
import { DomainEvents } from './events/domain-events.js';
import { BackgroundTasks } from './http/background-tasks.js';
import { ProblemFilter } from './http/problem.filter.js';
import { LOGGER, createLogger } from './logging/logger.js';
import { ErrorReporter } from './observability/error-reporter.js';

// Cross-cutting providers every module may use (design D1 `src/common`): configuration, clock,
// logger, the problem filter, the error reporter, background tasks and in-process events.
@Global()
@Module({
  providers: [
    { provide: AppConfig, useFactory: loadAppConfig },
    { provide: Clock, useClass: SystemClock },
    {
      provide: LOGGER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Logger => createLogger(config.env.LOG_LEVEL),
    },
    ProblemFilter,
    ErrorReporter,
    BackgroundTasks,
    DomainEvents,
  ],
  exports: [AppConfig, Clock, LOGGER, ProblemFilter, ErrorReporter, BackgroundTasks, DomainEvents],
})
export class CoreModule {}
