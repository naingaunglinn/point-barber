import { Module } from '@nestjs/common';

import { Jobs } from './jobs.service.js';

// Background jobs (ADR-002 · add-foundation-auth-access design D9): one pg-boss instance for the API.
@Module({
  providers: [Jobs],
  exports: [Jobs],
})
export class JobsModule {}
