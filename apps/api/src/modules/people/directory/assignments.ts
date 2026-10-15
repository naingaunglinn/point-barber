import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { AssignmentsRepository } from '../repositories/assignments.repository.js';

// "ACTIVE and assigned to that branch on the visit date" (P4.VIS.03 · D-AUTH-07 — 422
// not_assigned_to_branch at START, and the collector of a payment — add-walkin-visit-checkout).
@Injectable()
export class Assignments {
  constructor(private readonly repository: AssignmentsRepository) {}

  isActiveAndAssigned(
    db: Tx,
    key: { readonly employee_id: string; readonly branch_id: string; readonly date: string },
  ): Promise<boolean> {
    return this.repository.activeAndAssigned(db, key);
  }
}
