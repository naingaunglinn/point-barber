import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { BranchCodesRepository } from '../repositories/branch-codes.repository.js';

// What other modules may ask about a branch's code — the receipt-number prefix (D-PAY-06 ·
// add-walkin-visit-checkout design D6).
@Injectable()
export class BranchCodes {
  constructor(private readonly repository: BranchCodesRepository) {}

  async codeOf(db: Tx, branchId: string): Promise<string> {
    const code = await this.repository.codeOf(db, branchId);
    if (code === null) throw new Error(`branch ${branchId} does not exist`);
    return code;
  }
}
