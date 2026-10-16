import { Injectable } from '@nestjs/common';
import type { BranchSummary } from '@point/shared';

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

  /** The employee of a user with the members `/me` shows (P1.ME.01). */
  employeeProfile(userId: string) {
    return this.db.employees.findUnique({
      where: { user_id: userId },
      select: {
        id: true,
        employee_code: true,
        name_mm: true,
        name_en: true,
        photo_url: true,
        status: true,
        show_own_earnings: true,
      },
    });
  }

  /**
   * Branches as `BranchSummary` — one mapper naming all seven members, so a new column never leaks
   * (design D15); every branch of the company when `ids` is undefined; ordered by code.
   */
  async branchSummaries(ids?: readonly string[]): Promise<BranchSummary[]> {
    const rows = await this.db.branches.findMany({
      where: ids === undefined ? {} : { id: { in: [...ids] } },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name_mm: true,
        name_en: true,
        phone: true,
        status: true,
        is_public: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name_mm: row.name_mm,
      name_en: row.name_en,
      phone: row.phone,
      status: row.status as BranchSummary['status'],
      is_public: row.is_public,
    }));
  }

  /** The branches of the assignments active on `date`, ordered by effective_from, created_at, id. */
  async assignedBranchIds(employeeId: string, date: string): Promise<string[]> {
    const day = new Date(`${date}T00:00:00Z`);
    const rows = await this.db.employee_branches.findMany({
      where: {
        employee_id: employeeId,
        effective_from: { lte: day },
        OR: [{ effective_to: null }, { effective_to: { gte: day } }],
      },
      orderBy: [{ effective_from: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      select: { branch_id: true },
    });
    return [...new Set(rows.map((row) => row.branch_id))];
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
