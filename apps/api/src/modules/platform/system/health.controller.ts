import { Controller, Get } from '@nestjs/common';
import type { Health } from '@point/shared';

import { Public } from '../../../common/access/public.decorator.js';
import { SystemService } from './system.service.js';

// `/api` is the global prefix; the version is part of the path (ADR-009 · design D5).
@Controller('v1/health')
export class HealthController {
  constructor(private readonly system: SystemService) {}

  /** P1.SYS.01 */
  @Get()
  @Public()
  health(): Promise<Health> {
    return this.system.health();
  }
}
