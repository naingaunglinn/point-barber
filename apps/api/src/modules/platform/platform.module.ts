import { Module, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';

import { TargetResolvers } from '../../common/access/resolvers.js';
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
import { Observability } from './observability/observability.js';
import { RateLimiter } from './rate-limit/rate-limiter.js';
import { AttachmentsRepository } from './repositories/attachments.repository.js';
import { BranchClosuresRepository } from './repositories/branch-closures.repository.js';
import { OpeningHoursRepository } from './repositories/opening-hours.repository.js';
import { MaintenanceGate, StoreMaintenanceGate } from './settings/maintenance-gate.js';
import { SettingsModule } from './settings/settings.module.js';
import { SettingsCommands } from './settings/settings-commands.js';
import { SettingsWriteController } from './settings/settings-write.controller.js';
import { SettingsWrites } from './settings/settings-writes.js';
import { NoTodayBranch, TodayBranch } from './settings/today-branch.js';
import { S3StorageService } from './storage/s3-storage.service.js';
import { StorageService } from './storage/storage.service.js';
import { HealthController } from './system/health.controller.js';
import { MaintenanceController } from './system/maintenance.controller.js';
import { MaintenanceMode } from './system/maintenance-mode.js';
import { StatusController } from './system/status.controller.js';
import { SystemService } from './system/system.service.js';
import { ClosureAccess } from './website/closure-access.js';
import { OpeningHours } from './website/opening-hours.js';
import { OpeningHoursWrites } from './website/opening-hours-writes.js';
import { SiteContent } from './website/site-content.js';
import { WebsiteHoursController } from './website/website-hours.controller.js';
import { WebsitePeople } from './website/website-people.js';

// Bounded context `platform` (ADR-001 · docs/engineering/module-map.md): system health and status,
// the audit writer, idempotency, the rate limiter, background jobs, mail, error reporting, the settings
// store (add-settings-store) and the remaining seams, file storage, the document renderer, opening
// hours, the website refresh; notifications and uploads with later changes.
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
  imports: [JobsModule, MailModule, SettingsModule],
  controllers: [
    HealthController,
    StatusController,
    MaintenanceController,
    SettingsWriteController,
    // add-website-management — mounted part by part (website/not-built.ts): A2 the hours.
    WebsiteHoursController,
  ],
  providers: [
    SystemService,
    // add-settings-store — the store's write path beside the audit writer, P1.SET.03 / 04, P1.SYS.03.
    SettingsWrites,
    SettingsCommands,
    MaintenanceMode,
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
    SiteContent,
    // add-website-management task 1.6 — the closure loader of P8.WEB.07 / 08 (design D2).
    BranchClosuresRepository,
    ClosureAccess,
    // A2 — the week of opening hours and the people reads registered by people (design D1 / D5).
    WebsitePeople,
    OpeningHoursWrites,
    RateLimiter,
    Observability,
    // ADR-013: one headless Chromium per API process, launched on first use (design D10).
    { provide: DocumentRenderer, useClass: ChromiumDocumentRenderer },
    // The seams of design D13: the maintenance gate on the store (add-settings-store design D9);
    // scheduling and attendance replace TodayBranch.
    { provide: MaintenanceGate, useClass: StoreMaintenanceGate },
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
    SiteContent,
    WebsitePeople,
    RateLimiter,
    SettingsModule,
    MaintenanceGate,
    TodayBranch,
    StorageService,
    JobsModule,
    MailModule,
  ],
})
export class PlatformModule implements OnModuleInit {
  constructor(
    private readonly closureAccess: ClosureAccess,
    private readonly targets: TargetResolvers,
  ) {}

  onModuleInit(): void {
    this.closureAccess.register(this.targets);
  }
}
