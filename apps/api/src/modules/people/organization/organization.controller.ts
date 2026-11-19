import { Controller, Get, Param } from '@nestjs/common';
import {
  type BranchAssignment,
  type BranchSummary,
  type BranchesQuery,
  branchesQuerySchema,
} from '@point/shared';

import { CanView, Staff } from '../../../common/access/declarations.js';
import { ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { PeopleDirectory } from '../directory/people-directory.js';

// The two organization reads of add-foundation-auth-access (design D15).
@Controller('v1')
export class OrganizationController {
  constructor(private readonly directory: PeopleDirectory) {}

  /**
   * P1.BR.01 — every branch of the company, a reference list for every signed-in staff member
   * (API-PERM-03): not limited to the caller's scope; `branch.view` only decides the settings menu.
   */
  @Get('branches')
  @Staff()
  async branches(
    @ZQuery(branchesQuerySchema) query: BranchesQuery,
  ): Promise<{ items: BranchSummary[] }> {
    return {
      items: await this.directory.branchSummaries(
        undefined,
        query.status === undefined ? {} : { status: query.status },
      ),
    };
  }

  /**
   * P1.EMP.06 — the employee's branch assignments, ended ones included. The access guard has decided
   * already (P1-RULE-11): the caller is the employee, or holds an `employee.*` code for a branch of the
   * employee's active assignments or at company scope; otherwise 404, or 403 without any such code.
   */
  @Get('employees/:id/branches')
  @CanView('employee', { target: 'employee:id', orSelf: 'employee.id' })
  async employeeBranches(@Param('id') id: string): Promise<{ items: BranchAssignment[] }> {
    return { items: await this.directory.branchAssignments(id) };
  }
}
