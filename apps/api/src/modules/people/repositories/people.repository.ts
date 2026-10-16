import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';

// Reads of the people tables (ADR-001 rule 1 — the people module owns them). Inside a
// TransactionRunner.run() a read goes through that transaction, so it sees the work's own rows.
@Injectable()
export class PeopleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  /**
   * The branch of the employee's active assignment with the earliest effective_from on `date`
   * (a Myanmar calendar date); ties by created_at, then id. Null when none is active.
   */
  async primaryBranchId(employeeId: string, date: string): Promise<string | null> {
    const day = new Date(`${date}T00:00:00Z`);
    const row = await this.db.employee_branches.findFirst({
      where: {
        employee_id: employeeId,
        effective_from: { lte: day },
        OR: [{ effective_to: null }, { effective_to: { gte: day } }],
      },
      orderBy: [{ effective_from: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      select: { branch_id: true },
    });
    return row?.branch_id ?? null;
  }
}
