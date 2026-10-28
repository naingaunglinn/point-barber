import { Module } from '@nestjs/common';
import type { Logger } from 'pino';

import { AppConfig } from '../../common/config/config.js';
import { LOGGER } from '../../common/logging/logger.js';
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
/**
 * The local MinIO's bucket, created when missing (development and test). MinIO may still be starting
 * when the API starts in the same stack, so a few tries one second apart; then a warning, never a stop.
 */
async function localBucket(storage: S3StorageService, bucket: string, log: Logger): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      if ((await storage.ensureBucket()) === 'created') log.info({ bucket }, 'bucket created');
      return;
    } catch (error) {
      if (attempt === 5) {
        log.warn({ err: error, bucket }, 'bucket check failed — receipts cannot be stored');
        return;
      }
      await new Promise((done) => setTimeout(done, 1000));
    }
  }
}

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
    // ADR-014: the bucket of generated documents (add-walkin-visit-checkout design D10). In development
    // and test the local MinIO's bucket is created when missing; a failure is a warning, never a stop.
    {
      provide: StorageService,
      useFactory: async (config: AppConfig, log: Logger) => {
        const storage = new S3StorageService(config);
        if (config.env.APP_ENV === 'development' || config.env.APP_ENV === 'test') {
          await localBucket(storage, config.env.S3_BUCKET_APP, log);
        }
        return storage;
      },
      inject: [AppConfig, LOGGER],
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
