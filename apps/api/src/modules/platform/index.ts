// Public surface of the `platform` module (CG-ARCH-01 · ADR-001 rule 1): other modules import
// only from here.
export { Audit, type AuditEvent } from './audit/audit.service.js';
export { Audited, type AuditedOptions } from './audit/audited.js';
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
