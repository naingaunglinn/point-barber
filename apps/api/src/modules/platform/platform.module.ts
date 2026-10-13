import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { Audit } from './audit/audit.service.js';
import { AuditedInterceptor } from './audit/audited.js';
import { HealthController } from './system/health.controller.js';
import { StatusController } from './system/status.controller.js';
import { SystemService } from './system/system.service.js';

// Bounded context `platform` (ADR-001 · docs/engineering/module-map.md): system health and status,
// the audit writer; settings, notifications, attachments, jobs, documents and mail with later tasks.
@Module({
  imports: [PeopleModule],
  controllers: [HealthController, StatusController],
  providers: [SystemService, Audit, AuditedInterceptor],
  exports: [Audit, AuditedInterceptor],
})
export class PlatformModule {}
