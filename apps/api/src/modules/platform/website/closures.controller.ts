import { Controller, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import {
  type BranchClosure,
  type ClosureCreateBody,
  type ClosureListQuery,
  type ClosureResult,
  type CursorPage,
  closureCreateSchema,
  closureListQuerySchema,
} from '@point/shared';
import type { Response } from 'express';

import { AccessContext } from '../../../common/access/access-context.js';
import { Can, CanView } from '../../../common/access/declarations.js';
import { ZBody, ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../audit/audited.js';
import { ClosureReads } from './closure-reads.js';
import { ClosureWrites, WEBSITE_CLOSURE_CREATE } from './closure-writes.js';
import { notBuilt } from './not-built.js';

// Temporary branch closures (P8.WEB.05 – 08 · P8-RULE-12 · owner F7 / F8 · design D2): the list is
// filtered to the caller's branches (API-PERM-03); a write needs `website.update` covering the closure's
// branch — the body's branch on a create, the stored row's (ClosureAccess) on an edit or archive.
// Part A3 builds the list and the create; part A4 the edit and the archive (see not-built.ts).
@Controller('v1/website/closures')
export class ClosuresController {
  constructor(
    private readonly reads: ClosureReads,
    private readonly writes: ClosureWrites,
  ) {}

  /** P8.WEB.05 — current and upcoming by default, cursor paging. */
  @Get()
  @CanView('website')
  list(
    @ZQuery(closureListQuerySchema) query: ClosureListQuery,
  ): Promise<CursorPage<BranchClosure>> {
    return this.reads.list(query, AccessContext.scope());
  }

  /** P8.WEB.06 — 201 `ClosureResult` with the bookings inside it. */
  @Post()
  @Can('website.update', { branch: 'body.branch_id' })
  @Audited({ actions: [WEBSITE_CLOSURE_CREATE] })
  async create(
    @ZBody(closureCreateSchema) body: ClosureCreateBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClosureResult> {
    const result = await this.writes.create(body);
    res.location(`/api/v1/website/closures/${result.closure.id}`);
    return result;
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
