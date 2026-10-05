import { Module } from '@nestjs/common';

import { HealthController } from './system/health.controller.js';
import { StatusController } from './system/status.controller.js';
import { SystemService } from './system/system.service.js';

// Bounded context `platform` (ADR-001 · docs/engineering/module-map.md): system health and status
// now; settings, notifications, attachments, audit, jobs, documents and mail with later changes.
@Module({
  controllers: [HealthController, StatusController],
  providers: [SystemService],
})
export class PlatformModule {}
