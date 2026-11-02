import { Controller, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import {
  type Branch,
  type BranchCreateBody,
  type BranchStatusBody,
  type BranchUpdateBody,
  branchCreateSchema,
  branchStatusSchema,
  branchUpdateSchema,
} from '@point/shared';
import type { Response } from 'express';

import { AccessContext } from '../../../common/access/access-context.js';
import { Can, Staff } from '../../../common/access/declarations.js';
import { toReadScope } from '../../../common/access/read-scope.js';
import { ZBody } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../../platform/index.js';
import { BRANCH_CREATE, BRANCH_STATUS, BRANCH_UPDATE, Branches } from './branches.js';

// The four branch endpoints of add-branch-management (P1.BR.02 – 05 · design D2): one access
// declaration each (API-PERM-02 · CG-API-02); every handler calls one service method (CG-API-01).
// P1.BR.01, the list, stays in OrganizationController.
@Controller('v1/branches')
export class BranchesController {
  constructor(private readonly branches: Branches) {}

  /** P1.BR.03 — any signed-in staff member; outside the read scope 404, as for an unknown id. */
  @Get(':id')
  @Staff()
  detail(@Param('id') id: string): Promise<Branch> {
    return this.branches.detail(id, toReadScope(AccessContext.scope()));
  }

  /** P1.BR.02 — company master: `branch.create` at company scope; 201 + Location (API-DATA-10). */
  @Post()
  @Can('branch.create', { level: 'company' })
  @Audited({ actions: [BRANCH_CREATE] })
  async create(
    @ZBody(branchCreateSchema) body: BranchCreateBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Branch> {
    const branch = await this.branches.create(body);
    res.location(`/api/v1/branches/${branch.id}`);
    return branch;
  }

  /** P1.BR.04 — branch data: `branch.update` for this branch; partial, never the code (BR1). */
  @Patch(':id')
  @Can('branch.update', { branch: 'params.id' })
  @Audited({ actions: [BRANCH_UPDATE] })
  update(
    @Param('id') id: string,
    @ZBody(branchUpdateSchema) body: BranchUpdateBody,
  ): Promise<Branch> {
    return this.branches.update(id, body);
  }

  /** P1.BR.05 — company master: `branch.delete` at company scope; deactivate or re-activate. */
  @Post(':id/status')
  @HttpCode(200)
  @Can('branch.delete', { level: 'company' })
  @Audited({ actions: [BRANCH_STATUS] })
  setStatus(
    @Param('id') id: string,
    @ZBody(branchStatusSchema) body: BranchStatusBody,
  ): Promise<Branch> {
    return this.branches.setStatus(id, body);
  }
}
