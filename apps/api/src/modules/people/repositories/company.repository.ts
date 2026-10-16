import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';

// The company row and its roles (D-ORG-03 · D-ROLE-09).
@Injectable()
export class CompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? TransactionScope.current()?.tx ?? this.prisma;
  }

  /** The one company (D-ORG-03): the oldest row; null before the base seed. */
  async companyId(tx?: Tx): Promise<string | null> {
    const row = await this.db(tx).companies.findFirst({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async createCompany(
    tx: Tx,
    row: { id: string; name_mm: string; name_en: string | null },
    at: Date,
  ): Promise<void> {
    await tx.companies.create({ data: { ...row, created_at: at, updated_at: at } });
  }

  /** Every role of the company, archived ones included — "no role at all" is the seed's test. */
  roleCount(tx: Tx, companyId: string): Promise<number> {
    return tx.roles.count({ where: { company_id: companyId } });
  }

  async createRole(
    tx: Tx,
    role: { id: string; company_id: string; name_mm: string; name_en: string },
    permissionIds: readonly string[],
    linkId: () => string,
    at: Date,
  ): Promise<void> {
    await tx.roles.create({ data: { ...role, created_at: at, updated_at: at } });
    if (permissionIds.length > 0) {
      await tx.role_permissions.createMany({
        data: permissionIds.map((permissionId) => ({
          id: linkId(),
          role_id: role.id,
          permission_id: permissionId,
          created_at: at,
        })),
      });
    }
  }

  /** The non-archived permissions: code → id. */
  async activePermissions(tx: Tx): Promise<Map<string, string>> {
    const rows = await tx.permissions.findMany({
      where: { archived_at: null },
      select: { id: true, code: true },
    });
    return new Map(rows.map((row) => [row.code, row.id]));
  }
}
