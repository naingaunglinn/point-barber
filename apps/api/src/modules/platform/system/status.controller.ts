import { Controller, Get } from '@nestjs/common';
import type { SystemStatus } from '@point/shared';

import { Public } from '../../../common/access/public.decorator.js';
import { SystemService } from './system.service.js';

@Controller('v1/system')
export class StatusController {
  constructor(private readonly system: SystemService) {}

  /** P1.SYS.02 */
  @Get('status')
  @Public()
  status(): SystemStatus {
    return this.system.status();
  }
}
