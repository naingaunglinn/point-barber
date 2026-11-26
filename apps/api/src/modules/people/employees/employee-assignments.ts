import { Injectable } from '@nestjs/common';
import type { BranchAssignBody, BranchAssignment, BranchEndBody, WarningDto } from '@point/shared';

// P1.EMP.07 / 08 (add-employee-management design D1). Task 2.4 gives the controller its surface; the
// methods are built in the tasks of group 6 and throw until then.
@Injectable()
export class EmployeeAssignments {
  assign(_employeeId: string, _body: BranchAssignBody): Promise<BranchAssignment> {
    throw new Error('not built yet: add-employee-management task 6');
  }

  end(
    _employeeId: string,
    _assignmentId: string,
    _body: BranchEndBody,
  ): Promise<BranchAssignment & { warnings: WarningDto[] }> {
    throw new Error('not built yet: add-employee-management task 6');
  }
}
