import { Module } from '@nestjs/common';

import { AppConfig } from '../../common/config/config.js';
import { Attachments } from './attachments/attachments.service.js';
import { ReceiptFilesLock } from './attachments/receipt-files-lock.js';
import { Audit } from './audit/audit.service.js';
import { AuditedInterceptor } from './audit/audited.js';
import { CodeTables } from './code-tables/code-tables.js';
import { ChromiumDocumentRenderer } from './documents/chromium-renderer.js';
import { DocumentRenderer } from './documents/document-renderer.js';
import { Idempotency } from './idempotency/idempotency.service.js';
import { IdempotentInterceptor } from './idempotency/idempotent.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MailModule } from './mail/mail.module.js';
import { RateLimiter } from './rate-limit/rate-limiter.js';
import { AttachmentsRepository } from './repositories/attachments.repository.js';
import { OpeningHoursRepository } from './repositories/opening-hours.repository.js';
import { MaintenanceGate, OpenMaintenanceGate } from './settings/maintenance-gate.js';
import { DefaultsSettingsReader, SettingsReader } from './settings/settings-reader.js';
import { NoTodayBranch, TodayBranch } from './settings/today-branch.js';
import { S3StorageService } from './storage/s3-storage.service.js';
import { StorageService } from './storage/storage.service.js';
import { HealthController } from './system/health.controller.js';
import { StatusController } from './system/status.controller.js';
import { SystemService } from './system/system.service.js';
import { OpeningHours } from './website/opening-hours.js';

// Bounded context `platform` (ADR-001 · docs/engineering/module-map.md): system health and status,
// the audit writer, idempotency, the rate limiter, background jobs, mail, the settings seams and file
// storage, the document renderer, opening hours; the settings store, notifications and uploads with later
// changes.
@Module({
  imports: [JobsModule, MailModule],
  controllers: [HealthController, StatusController],
  providers: [
    SystemService,
    AttachmentsRepository,
    Attachments,
    ReceiptFilesLock,
    Audit,
    AuditedInterceptor,
    CodeTables,
    Idempotency,
    IdempotentInterceptor,
    OpeningHoursRepository,
    OpeningHours,
    RateLimiter,
    // ADR-013: one headless Chromium per API process, launched on first use (design D10).
    { provide: DocumentRenderer, useClass: ChromiumDocumentRenderer },
    // The seams of design D13: add-settings-store, scheduling and attendance replace them.
    { provide: SettingsReader, useClass: DefaultsSettingsReader },
    { provide: MaintenanceGate, useClass: OpenMaintenanceGate },
    { provide: TodayBranch, useClass: NoTodayBranch },
    // ADR-014: the bucket of generated documents (add-walkin-visit-checkout design D10).
    {
      provide: StorageService,
      useFactory: (config: AppConfig) => new S3StorageService(config),
      inject: [AppConfig],
    },
  ],
  exports: [
    Attachments,
    ReceiptFilesLock,
    Audit,
    AuditedInterceptor,
    CodeTables,
    DocumentRenderer,
    Idempotency,
    IdempotentInterceptor,
    OpeningHours,
    RateLimiter,
    SettingsReader,
    MaintenanceGate,
    TodayBranch,
    StorageService,
    JobsModule,
    MailModule,
  ],
})
export class PlatformModule {}
