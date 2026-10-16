import { Injectable } from '@nestjs/common';
import { EmployeeStatus, ScopeType } from '@point/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';

// Role assignments (D-ROLE-03 · P1-RULE-12): which roles an employee holds at company scope.
@Injectable()
export class RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? TransactionScope.current()?.tx ?? this.prisma;
  }

  private static readonly roleCodes = {
    roles: {
      select: {
        role_permissions: {
          select: { permissions: { select: { code: true, archived_at: true } } },
        },
      },
    },
  } as const;

  private static codesOf(row: {
    roles: { role_permissions: { permissions: { code: string; archived_at: Date | null } }[] };
  }): string[] {
    return row.roles.role_permissions
      .filter((link) => link.permissions.archived_at === null)
      .map((link) => link.permissions.code);
  }

  /** The codes of each unrevoked company-scope role assignment of one employee. */
  async companyScopeRoleCodes(employeeId: string, tx?: Tx): Promise<string[][]> {
    const rows = await this.db(tx).employee_roles.findMany({
      where: { employee_id: employeeId, scope_type: ScopeType.COMPANY, revoked_at: null },
      select: RoleRepository.roleCodes,
    });
    return rows.map(RoleRepository.codesOf);
  }

  /** The same, for every ACTIVE employee. */
  async activeEmployeesCompanyScopeRoleCodes(tx: Tx): Promise<string[][]> {
    const rows = await tx.employee_roles.findMany({
      where: {
        scope_type: ScopeType.COMPANY,
        revoked_at: null,
        employees: { status: EmployeeStatus.ACTIVE },
      },
      select: RoleRepository.roleCodes,
    });
    return rows.map(RoleRepository.codesOf);
  }
}
