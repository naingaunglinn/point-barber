import { Controller, Get, Put } from '@nestjs/common';
import type { BranchHoursWeek } from '@point/shared';

import { Can, CanView } from '../../../common/access/declarations.js';
import { notBuilt } from './not-built.js';

// A branch's weekly opening hours (P8.WEB.03 / 04 · P8-RULE-12 · owner F7 · design D2): branch data —
// a `website.*` code covering the branch reads them, `website.update` covering it writes them. Built
// by part A2; not mounted yet — see not-built.ts.
@Controller('v1/website/branches/:branch_id/hours')
export class WebsiteHoursController {
  /** P8.WEB.03 — the week, Monday first. */
  @Get()
  @CanView('website', { branch: 'params.branch_id' })
  week(): Promise<BranchHoursWeek> {
    return notBuilt('P8.WEB.03');
  }

  /** P8.WEB.04 — a whole valid week; only the changed weekdays are written. */
  @Put()
  @Can('website.update', { branch: 'params.branch_id' })
  saveWeek(): Promise<BranchHoursWeek> {
    return notBuilt('P8.WEB.04');
  }
}
