import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { Audit } from './audit/audit.service.js';
import { AuditedInterceptor } from './audit/audited.js';
import { Idempotency } from './idempotency/idempotency.service.js';
import { IdempotentInterceptor } from './idempotency/idempotent.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MailModule } from './mail/mail.module.js';
import { RateLimiter } from './rate-limit/rate-limiter.js';
import { MaintenanceGate, OpenMaintenanceGate } from './settings/maintenance-gate.js';
import { DefaultsSettingsReader, SettingsReader } from './settings/settings-reader.js';
import { NoTodayBranch, TodayBranch } from './settings/today-branch.js';
import { HealthController } from './system/health.controller.js';
import { StatusController } from './system/status.controller.js';
import { SystemService } from './system/system.service.js';

// Bounded context `platform` (ADR-001 · docs/engineering/module-map.md): system health and status,
// the audit writer, idempotency, the rate limiter, background jobs, mail and the settings seams; the settings
// store, notifications, attachments and documents with later changes.
@Module({
  imports: [PeopleModule, JobsModule, MailModule],
  controllers: [HealthController, StatusController],
  providers: [
    SystemService,
    Audit,
    AuditedInterceptor,
    Idempotency,
    IdempotentInterceptor,
    RateLimiter,
    // The seams of design D13: add-settings-store, scheduling and attendance replace them.
    { provide: SettingsReader, useClass: DefaultsSettingsReader },
    { provide: MaintenanceGate, useClass: OpenMaintenanceGate },
    { provide: TodayBranch, useClass: NoTodayBranch },
  ],
  exports: [
    Audit,
    AuditedInterceptor,
    Idempotency,
    IdempotentInterceptor,
    RateLimiter,
    SettingsReader,
    MaintenanceGate,
    TodayBranch,
    JobsModule,
    MailModule,
  ],
})
export class PlatformModule {}
