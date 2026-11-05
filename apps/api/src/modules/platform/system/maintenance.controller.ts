import { Controller, Put } from '@nestjs/common';
import { type MaintenanceValue, type SystemStatus, maintenanceBodySchema } from '@point/shared';

import { Can } from '../../../common/access/declarations.js';
import { ZBody } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../audit/audited.js';
import { MaintenanceMode } from './maintenance-mode.js';

@Controller('v1/system')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceMode) {}

  /** P1.SYS.03 */
  @Put('maintenance')
  @Audited({ actions: ['system.maintenance'] })
  @Can('settings.update', { level: 'company' })
  set(@ZBody(maintenanceBodySchema) body: MaintenanceValue): Promise<SystemStatus> {
    return this.maintenance.set(body);
  }
}
