import { Global, Module } from '@nestjs/common';
import type { Logger } from 'pino';

import { Clock, SystemClock } from './clock/clock.js';
import { AppConfig, loadAppConfig } from './config/config.js';
import { ProblemFilter } from './http/problem.filter.js';
import { LOGGER, createLogger } from './logging/logger.js';

// Cross-cutting providers every module may use (design D1 `src/common`): configuration, clock,
// logger and the problem filter.
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
  ],
  exports: [AppConfig, Clock, LOGGER, ProblemFilter],
})
export class CoreModule {}
