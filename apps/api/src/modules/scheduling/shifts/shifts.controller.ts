import { Controller, HttpCode, Post } from '@nestjs/common';
import { type GenerateRequest, generateRequestSchema } from '@point/shared';

import { Can } from '../../../common/access/declarations.js';
import { ZBody } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../../platform/index.js';
import { callerGrants } from '../patterns/caller-grants.js';
import { GenerateNow } from './generate-now.js';
import { SCHEDULE_GENERATE } from './shifts-generate.job.js';

// P2.SHF.06 (design D2 — one access declaration, API-PERM-02): `schedule.update` for the branch of the body;
// the handler answers 202 `{ job_id }`. P2.SHF.01 / 02 (the reads) join this controller with part A6.
@Controller('v1/schedule')
export class ShiftsController {
  constructor(private readonly generateNow: GenerateNow) {}

  /** P2.SHF.06 — queue `shifts.generate` for the branch's employees the caller's grants cover. */
  @Post('generate')
  @HttpCode(202)
  @Can('schedule.update', { branch: 'body.branch_id' })
  @Audited({ actions: [SCHEDULE_GENERATE] })
  generate(@ZBody(generateRequestSchema) body: GenerateRequest): Promise<{ job_id: string }> {
    return this.generateNow.request(body, callerGrants());
  }
}
