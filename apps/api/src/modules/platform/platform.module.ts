import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { Audit } from './audit/audit.service.js';
import { AuditedInterceptor } from './audit/audited.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MailModule } from './mail/mail.module.js';
import { RateLimiter } from './rate-limit/rate-limiter.js';
import { HealthController } from './system/health.controller.js';
import { StatusController } from './system/status.controller.js';
import { SystemService } from './system/system.service.js';

// Bounded context `platform` (ADR-001 · docs/engineering/module-map.md): system health and status,
// the audit writer, the rate limiter, background jobs and mail; settings, notifications,
// attachments and documents with later changes.
@Module({
  imports: [PeopleModule, JobsModule, MailModule],
  controllers: [HealthController, StatusController],
  providers: [SystemService, Audit, AuditedInterceptor, RateLimiter],
  exports: [Audit, AuditedInterceptor, RateLimiter, JobsModule, MailModule],
})
export class PlatformModule {}
