import { Controller, Get, HttpCode, Param, Patch, Post, Put, Res } from '@nestjs/common';
import {
  type BranchAssignBody,
  type BranchAssignment,
  type BranchEndBody,
  type EmployeeCreateBody,
  type EmployeeDto,
  type EmployeeListQuery,
  type EmployeeStatusBody,
  type EmployeeUpdateBody,
  type EmployeeWarning,
  type PublicRatingBody,
  type RevokeAllBody,
  type SessionDto,
  branchAssignSchema,
  branchEndSchema,
  employeeCreateSchema,
  employeeListQuerySchema,
  employeeStatusSchema,
  employeeUpdateSchema,
  publicRatingSchema,
  revokeAllSchema,
} from '@point/shared';
import type { Response } from 'express';

import { AccessContext } from '../../../common/access/access-context.js';
import { Can, CanFields, CanView } from '../../../common/access/declarations.js';
import { toReadScope } from '../../../common/access/read-scope.js';
import { ZBody, ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { EmployeeAssignments } from './employee-assignments.js';
import { EmployeeDirectory, type EmployeePage } from './employee-directory.js';
import { EMPLOYEE_UPDATE_FIELDS } from './employee-fields.js';
import { Employees } from './employees.js';

// The 12 employee routes of add-employee-management (design D2 · API-PERM-02): one access declaration
// each (CG-API-02), one service call per handler (CG-API-01). A handler whose service method is not
// built yet throws until its task (3 – 7); the access rules are decided by the guard before it runs.
@Controller('v1/employees')
export class EmployeesController {
  constructor(
    private readonly employees: Employees,
    private readonly directory: EmployeeDirectory,
    private readonly assignments: EmployeeAssignments,
  ) {}

  /** P1.EMP.01 — a management read; the guard hands over the scope to filter by. */
  @Get()
  @CanView('employee')
  list(@ZQuery(employeeListQuerySchema) query: EmployeeListQuery): Promise<EmployeePage> {
    return this.directory.list(query, toReadScope(AccessContext.scope()));
  }

  /** P1.EMP.02 — 201 + Location (API-DATA-10). */
  @Post()
  @Can('employee.create', { branch: 'body.branch_ids[]' })
  async create(
    @ZBody(employeeCreateSchema) body: EmployeeCreateBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EmployeeDto> {
    const employee = await this.employees.create(body);
    res.location(`/api/v1/employees/${employee.id}`);
    return employee;
  }

  /** P1.EMP.03 — the code in scope, or the employee themself. */
  @Get(':id')
  @CanView('employee', { target: 'employee:id', orSelf: 'employee.id' })
  detail(@Param('id') id: string): Promise<EmployeeDto> {
    return this.directory.detail(id);
  }

  /** P1.EMP.04 — the code of each field group the body touches. */
  @Patch(':id')
  @CanFields(EMPLOYEE_UPDATE_FIELDS, { target: 'employee:id' })
  update(
    @Param('id') id: string,
    @ZBody(employeeUpdateSchema) body: EmployeeUpdateBody,
  ): Promise<EmployeeDto> {
    return this.employees.update(id, body);
  }

  /** P1.EMP.05 — deactivate, resign, terminate or reactivate. */
  @Post(':id/status')
  @HttpCode(200)
  @Can('employee.delete', { target: 'employee:id' })
  setStatus(
    @Param('id') id: string,
    @ZBody(employeeStatusSchema) body: EmployeeStatusBody,
  ): Promise<EmployeeDto & { warnings: EmployeeWarning[] }> {
    return this.employees.setStatus(id, body);
  }

  /** P1.EMP.12 */
  @Put(':id/public-rating')
  @Can('employee.rating_update', { target: 'employee:id' })
  setRating(
    @Param('id') id: string,
    @ZBody(publicRatingSchema) body: PublicRatingBody,
  ): Promise<EmployeeDto> {
    return this.employees.setRating(id, body);
  }

  /** P1.EMP.07 — the scope covers the target branch and the employee's branches (P1-RULE-11). */
  @Post(':id/branches')
  @Can('employee.branch_assign', { branch: 'body.branch_id', target: 'employee:id' })
  assign(
    @Param('id') id: string,
    @ZBody(branchAssignSchema) body: BranchAssignBody,
  ): Promise<BranchAssignment> {
    return this.assignments.assign(id, body);
  }

  /** P1.EMP.08 — the branch is the one of the assignment (an assignment of another employee: 404). */
  @Post(':id/branches/:assignment_id/end')
  @HttpCode(200)
  @Can('employee.branch_assign', { branch: 'params.assignment_id→entity.branch_id' })
  endAssignment(
    @Param('id') id: string,
    @Param('assignment_id') assignmentId: string,
    @ZBody(branchEndSchema) body: BranchEndBody,
  ): Promise<BranchAssignment & { warnings: EmployeeWarning[] }> {
    return this.assignments.end(id, assignmentId, body);
  }

  /** P1.EMP.13 */
  @Post(':id/invite/resend')
  @HttpCode(202)
  @Can('employee.access_update', { target: 'employee:id' })
  resendInvite(@Param('id') id: string): Promise<void> {
    return this.employees.resendInvite(id);
  }

  /** P1.EMP.14 */
  @Post(':id/invite/cancel')
  @HttpCode(200)
  @Can('employee.access_update', { target: 'employee:id' })
  cancelInvite(@Param('id') id: string): Promise<EmployeeDto> {
    return this.employees.cancelInvite(id);
  }

  /** P1.EMP.15 */
  @Get(':id/sessions')
  @Can('employee.access_update', { target: 'employee:id' })
  sessions(@Param('id') id: string): Promise<SessionDto[]> {
    return this.employees.sessions(id);
  }

  /** P1.EMP.16 */
  @Post(':id/sessions/revoke-all')
  @HttpCode(204)
  @Can('employee.access_update', { target: 'employee:id' })
  revokeAllSessions(
    @Param('id') id: string,
    @ZBody(revokeAllSchema) body: RevokeAllBody,
  ): Promise<void> {
    return this.employees.revokeAllSessions(id, body);
  }
}
