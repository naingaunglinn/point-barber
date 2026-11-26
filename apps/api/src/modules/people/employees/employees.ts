import { Injectable } from '@nestjs/common';
import type {
  EmployeeCreateBody,
  EmployeeDto,
  EmployeeStatusBody,
  EmployeeUpdateBody,
  WarningDto,
  PublicRatingBody,
  RevokeAllBody,
  SessionDto,
} from '@point/shared';

// The write side of the employee endpoints (add-employee-management design D1). Task 2.4 only gives
// the controller its surface: each method is built in the task named on it and throws until then.
const notBuilt = (task: string): never => {
  throw new Error(`not built yet: add-employee-management task ${task}`);
};

@Injectable()
export class Employees {
  /** P1.EMP.02 — tasks 3.x. */
  create(_body: EmployeeCreateBody): Promise<EmployeeDto> {
    return notBuilt('3');
  }

  /** P1.EMP.04 — tasks 4.x. */
  update(_id: string, _body: EmployeeUpdateBody): Promise<EmployeeDto> {
    return notBuilt('4');
  }

  /** P1.EMP.05 — tasks 5.x. */
  setStatus(
    _id: string,
    _body: EmployeeStatusBody,
  ): Promise<EmployeeDto & { warnings: WarningDto[] }> {
    return notBuilt('5');
  }

  /** P1.EMP.12 — tasks 4.x. */
  setRating(_id: string, _body: PublicRatingBody): Promise<EmployeeDto> {
    return notBuilt('4');
  }

  /** P1.EMP.13 — tasks 7.x. */
  resendInvite(_id: string): Promise<void> {
    return notBuilt('7');
  }

  /** P1.EMP.14 — tasks 7.x. */
  cancelInvite(_id: string): Promise<EmployeeDto> {
    return notBuilt('7');
  }

  /** P1.EMP.15 — tasks 7.x. */
  sessions(_id: string): Promise<SessionDto[]> {
    return notBuilt('7');
  }

  /** P1.EMP.16 — tasks 7.x. */
  revokeAllSessions(_id: string, _body: RevokeAllBody): Promise<void> {
    return notBuilt('7');
  }
}
