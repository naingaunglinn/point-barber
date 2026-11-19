import { Controller, Get, Param, Put } from '@nestjs/common';
import {
  type BranchHoursWeek,
  type BranchHoursWriteBody,
  branchHoursWriteSchema,
} from '@point/shared';

import { Can, CanView } from '../../../common/access/declarations.js';
import { ZBody } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../audit/audited.js';
import { OpeningHours } from './opening-hours.js';
import { OpeningHoursWrites, WEBSITE_HOURS_UPDATE } from './opening-hours-writes.js';

// A branch's weekly opening hours (P8.WEB.03 / 04 · P8-RULE-12 · owner F7 · design D2 / D5): branch
// data — a `website.*` code covering the branch reads them (another branch: 404, API-PERM-03),
// `website.update` covering it writes them (another branch: 403 `forbidden`).
@Controller('v1/website/branches/:branch_id/hours')
export class WebsiteHoursController {
  constructor(
    private readonly hours: OpeningHours,
    private readonly writes: OpeningHoursWrites,
  ) {}

  /** P8.WEB.03 — the week, Monday first. */
  @Get()
  @CanView('website', { branch: 'params.branch_id' })
  week(@Param('branch_id') branchId: string): Promise<BranchHoursWeek> {
    return this.hours.week(branchId);
  }

  /** P8.WEB.04 — a whole valid week; only the changed weekdays are written. */
  @Put()
  @Can('website.update', { branch: 'params.branch_id' })
  @Audited({ actions: [WEBSITE_HOURS_UPDATE] })
  saveWeek(
    @Param('branch_id') branchId: string,
    @ZBody(branchHoursWriteSchema) body: BranchHoursWriteBody,
  ): Promise<BranchHoursWeek> {
    return this.writes.saveWeek(branchId, body);
  }
}
