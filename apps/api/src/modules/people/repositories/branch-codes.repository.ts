import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The code of a branch (Part 1 — the people module owns branches): the prefix of every receipt
// number (D-PAY-06).
@Injectable()
export class BranchCodesRepository {
  async codeOf(db: Tx, branchId: string): Promise<string | null> {
    const row = await db.branches.findUnique({ where: { id: branchId }, select: { code: true } });
    return row?.code ?? null;
  }
}
