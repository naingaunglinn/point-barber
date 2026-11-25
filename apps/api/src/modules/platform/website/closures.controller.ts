import { Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import type { BranchClosure, ClosureResult, CursorPage } from '@point/shared';

import { Can, CanView } from '../../../common/access/declarations.js';
import { notBuilt } from './not-built.js';

// Temporary branch closures (P8.WEB.05 – 08 · P8-RULE-12 · owner F7 / F8 · design D2): the list is
// filtered to the caller's branches (API-PERM-03); a write needs `website.update` covering the closure's
// branch — the body's branch on a create, the stored row's (ClosureAccess) on an edit or archive.
// Built by parts A3 / A4; not mounted yet — see not-built.ts.
@Controller('v1/website/closures')
export class ClosuresController {
  /** P8.WEB.05 — current and upcoming by default, cursor paging (part A3). */
  @Get()
  @CanView('website')
  list(): Promise<CursorPage<BranchClosure>> {
    return notBuilt('P8.WEB.05');
  }

  /** P8.WEB.06 — 201 `ClosureResult` with the bookings inside it (part A3). */
  @Post()
  @Can('website.update', { branch: 'body.branch_id' })
  create(): Promise<ClosureResult> {
    return notBuilt('P8.WEB.06');
  }

  /** P8.WEB.07 — an edit by the closure's state (part A4). */
  @Patch(':id')
  @Can('website.update', { branch: 'params.id→entity.branch_id' })
  update(): Promise<ClosureResult> {
    return notBuilt('P8.WEB.07');
  }

  /** P8.WEB.08 — delete = archive, only while no past day changes (part A4). */
  @Post(':id/archive')
  @HttpCode(200)
  @Can('website.update', { branch: 'params.id→entity.branch_id' })
  archive(): Promise<BranchClosure> {
    return notBuilt('P8.WEB.08');
  }
}
