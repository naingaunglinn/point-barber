// Public surface of the `platform` module (CG-ARCH-01 · ADR-001 rule 1): other modules import
// only from here.
export {
  type AttachmentRow,
  Attachments,
  type GeneratedFile,
} from './attachments/attachments.service.js';
export { ReceiptFilesLock } from './attachments/receipt-files-lock.js';
export { Audit, type AuditEvent } from './audit/audit.service.js';
export { Audited, type AuditedOptions } from './audit/audited.js';
export { CodeTables, SYNC_CODE_TABLES } from './code-tables/code-tables.js';
export { DocumentRenderer, type PdfPage } from './documents/document-renderer.js';
export { InMemoryDocumentRenderer } from './documents/in-memory-renderer.js';
export type { RenderPriority } from './documents/render-queue.js';
export { Idempotency, type IdempotentSpec } from './idempotency/idempotency.service.js';
export { Idempotent, IdempotencyKey } from './idempotency/idempotent.js';
export { type JobHandler, Jobs } from './jobs/jobs.service.js';
export { Mail } from './mail/mail.service.js';
export { PlatformModule } from './platform.module.js';
export { RateLimiter, type RateLimitResult } from './rate-limit/rate-limiter.js';
export { MaintenanceGate } from './settings/maintenance-gate.js';
export {
  CLIENT_READABLE_KEYS,
  type SettingKey,
  SettingsReader,
  type SettingValues,
} from './settings/settings-reader.js';
export { TodayBranch } from './settings/today-branch.js';
export { InMemoryStorageService } from './storage/in-memory-storage.service.js';
export {
  StorageObjectMissing,
  StorageService,
  type StoredObjectInfo,
} from './storage/storage.service.js';
export { type OpeningDay, OpeningHours } from './website/opening-hours.js';
