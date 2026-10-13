// Public surface of the `platform` module (CG-ARCH-01 · ADR-001 rule 1): other modules import
// only from here.
export { Audit, type AuditEvent } from './audit/audit.service.js';
export { Audited, type AuditedOptions } from './audit/audited.js';
export { PlatformModule } from './platform.module.js';
