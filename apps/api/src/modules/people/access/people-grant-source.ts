import { Injectable } from '@nestjs/common';

import { GrantSource, type GrantSourceRows } from '../../../common/access/grant-set.js';
import { AccessRepository } from '../repositories/access.repository.js';

// The people module's side of the access port (design D1 · D11): the caller's role assignments and
// branch assignments, read on every request — ADR-005 "no cache at this scale".
@Injectable()
export class PeopleGrantSource extends GrantSource {
  constructor(private readonly repository: AccessRepository) {
    super();
  }

  override async rowsFor(employeeId: string): Promise<GrantSourceRows> {
    const [assignments, branches] = await Promise.all([
      this.repository.assignmentsOf(employeeId),
      this.repository.branchAssignmentsOf(employeeId),
    ]);
    return { assignments, branches };
  }
}
