import { Controller, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import {
  type LeaveType,
  type LeaveTypeCreateBody,
  type LeaveTypeUpdateBody,
  type LeaveTypesQuery,
  leaveTypeCreateSchema,
  leaveTypeUpdateSchema,
  leaveTypesQuerySchema,
} from '@point/shared';
import type { Response } from 'express';

import { Can, Staff } from '../../../common/access/declarations.js';
import type { GrantSet } from '../../../common/access/grant-set.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { ZBody, ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../../platform/index.js';
import {
  LEAVE_TYPE_ARCHIVE,
  LEAVE_TYPE_CREATE,
  LEAVE_TYPE_UPDATE,
  LeaveTypes,
} from './leave-types.js';

// The four leave-type endpoints of add-leave-types (P2.LVT.01 – 04 · design D2): one access
// declaration each (API-PERM-02 · CG-API-02); the writes are company master, so each needs its code
// at company scope (API-PERM-07 · ADR-012); every handler calls one service method (CG-API-01).

/** The caller's grants, which the access guard built for the `@Staff()` read (design D2). */
function callerGrants(): GrantSet {
  const grants = RequestContext.current()?.grants;
  if (grants === undefined) throw new Error('leave types: the access guard built no grant set');
  return grants;
}

@Controller('v1/leave-types')
export class LeaveTypesController {
  constructor(private readonly leaveTypes: LeaveTypes) {}

  /** P2.LVT.01 — any signed-in staff member; `include_archived=true` → `leave_type.view⁺`. */
  @Get()
  @Staff()
  list(@ZQuery(leaveTypesQuerySchema) query: LeaveTypesQuery): Promise<{ items: LeaveType[] }> {
    return this.leaveTypes.list(query, callerGrants());
  }

  /** P2.LVT.02 — `leave_type.create` at company scope; 201 + Location (API-DATA-10). */
  @Post()
  @Can('leave_type.create', { level: 'company' })
  @Audited({ actions: [LEAVE_TYPE_CREATE] })
  async create(
    @ZBody(leaveTypeCreateSchema) body: LeaveTypeCreateBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LeaveType> {
    const leaveType = await this.leaveTypes.create(body);
    res.location(`/api/v1/leave-types/${leaveType.id}`);
    return leaveType;
  }

  /** P2.LVT.03 — `leave_type.update` at company scope; partial, `expected_updated_at` required. */
  @Patch(':id')
  @Can('leave_type.update', { level: 'company' })
  @Audited({ actions: [LEAVE_TYPE_UPDATE] })
  update(
    @Param('id') id: string,
    @ZBody(leaveTypeUpdateSchema) body: LeaveTypeUpdateBody,
  ): Promise<LeaveType> {
    return this.leaveTypes.update(id, body);
  }

  /** P2.LVT.04 — `leave_type.delete` at company scope; archive, never delete (D-DAT-05). */
  @Post(':id/archive')
  @HttpCode(200)
  @Can('leave_type.delete', { level: 'company' })
  @Audited({ actions: [LEAVE_TYPE_ARCHIVE] })
  archive(@Param('id') id: string): Promise<LeaveType> {
    return this.leaveTypes.archive(id);
  }
}
