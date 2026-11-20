import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';

// The branch_closures table (DB Part 8 v1.1 — the platform module writes it · D-WEB-04 · ADR-001 rule 1).
// add-website-management task 1.6: the branch of a closure, for the access guard's closure loader; the
// reads and writes of the closure endpoints come with parts A3 / A4.
@Injectable()
export class BranchClosuresRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  /** The branch of a closure, archived or not; null when no closure has the id. */
  async branchOf(closureId: string): Promise<string | null> {
    const row = await this.db.branch_closures.findUnique({
      where: { id: closureId },
      select: { branch_id: true },
    });
    return row?.branch_id ?? null;
  }
}
