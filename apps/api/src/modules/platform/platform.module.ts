import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { Audit } from './audit/audit.service.js';
import { AuditedInterceptor } from './audit/audited.js';
import { Jobs } from './jobs/jobs.service.js';
import { RateLimiter } from './rate-limit/rate-limiter.js';
import { HealthController } from './system/health.controller.js';
import { StatusController } from './system/status.controller.js';
import { SystemService } from './system/system.service.js';

// Bounded context `platform` (ADR-001 · docs/engineering/module-map.md): system health and status,
// the audit writer, the rate limiter, background jobs; settings, notifications, attachments,
// documents and mail with later tasks.
@Module({
  imports: [PeopleModule],
  controllers: [HealthController, StatusController],
  providers: [SystemService, Audit, AuditedInterceptor, RateLimiter, Jobs],
  exports: [Audit, AuditedInterceptor, RateLimiter, Jobs],
})
export class PlatformModule {}
