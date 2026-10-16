import { Injectable } from '@nestjs/common';

import type { AssignmentRow, BranchAssignmentRow } from '../../../common/access/grant-set.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';

// The rows the access guard builds a caller's grants from (P1-RULE-05 · design D11): one query over
// employee_roles × role_permissions × employee_role_branches, and the employee's branch assignments.
// Nothing is filtered here that GrantSet.build filters — a revoked assignment, an archived role or
// permission, a branch assignment outside its dates — so the rule is in one place and unit-tested.

interface AssignmentDbRow {
  readonly code: string;
  readonly module: string;
  readonly scope_type: number;
  readonly revoked_at: Date | null;
  readonly permission_archived_at: Date | null;
  readonly role_archived_at: Date | null;
  readonly branch_ids: string[] | null;
}

interface BranchDbRow {
  readonly branch_id: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
}

@Injectable()
export class AccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  async assignmentsOf(employeeId: string): Promise<AssignmentRow[]> {
    const rows = await this.db.$queryRaw<AssignmentDbRow[]>`
      SELECT p.code, p.module, er.scope_type, er.revoked_at,
             p.archived_at AS permission_archived_at, r.archived_at AS role_archived_at,
             (SELECT array_agg(erb.branch_id::text ORDER BY erb.branch_id)
                FROM employee_role_branches erb
               WHERE erb.employee_role_id = er.id) AS branch_ids
      FROM employee_roles er
      JOIN roles r ON r.id = er.role_id
      JOIN role_permissions rp ON rp.role_id = er.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE er.employee_id = ${employeeId}::uuid`;
    return rows.map((row) => ({ ...row, branch_ids: row.branch_ids ?? [] }));
  }

  /** Every branch assignment of the employee; dates as `YYYY-MM-DD`. */
  async branchAssignmentsOf(employeeId: string): Promise<BranchAssignmentRow[]> {
    return this.db.$queryRaw<BranchDbRow[]>`
      SELECT branch_id::text AS branch_id,
             to_char(effective_from, 'YYYY-MM-DD') AS effective_from,
             to_char(effective_to, 'YYYY-MM-DD') AS effective_to
      FROM employee_branches
      WHERE employee_id = ${employeeId}::uuid`;
  }

  /** The employee and its user, when it exists. */
  async employee(employeeId: string): Promise<{ id: string; user_id: string } | null> {
    return this.db.employees.findUnique({
      where: { id: employeeId },
      select: { id: true, user_id: true },
    });
  }

  async employeeOfUser(
    userId: string,
  ): Promise<{ id: string; status: number; company_id: string } | null> {
    return this.db.employees.findUnique({
      where: { user_id: userId },
      select: { id: true, status: true, company_id: true },
    });
  }
}
