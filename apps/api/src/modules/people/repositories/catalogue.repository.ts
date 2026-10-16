import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The permission and role tables of the people module (ADR-001 rule 1 · D-ROLE-08 · design D10).
// Every method takes the caller's transaction: the code-table sync and the seed are one business
// action each.

export interface PermissionRow {
  readonly id: string;
  readonly code: string;
  readonly module: string;
  readonly action: string;
  readonly description: string | null;
  readonly archived_at: Date | null;
}

/** One lock for every writer of the code tables and the first admin (design D10). */
const CODE_TABLES_LOCK = 'point:code_tables';

@Injectable()
export class CatalogueRepository {
  /** Waits for the other writers of the code tables; released at commit or rollback. */
  async lockCodeTables(tx: Tx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${CODE_TABLES_LOCK}, 0))`;
  }

  permissions(tx: Tx): Promise<PermissionRow[]> {
    return tx.permissions.findMany({
      select: {
        id: true,
        code: true,
        module: true,
        action: true,
        description: true,
        archived_at: true,
      },
    });
  }

  async insertPermission(tx: Tx, row: Omit<PermissionRow, 'archived_at'>, at: Date): Promise<void> {
    await tx.permissions.create({ data: { ...row, created_at: at, updated_at: at } });
  }

  async updatePermission(
    tx: Tx,
    id: string,
    change: Partial<Pick<PermissionRow, 'module' | 'action' | 'description' | 'archived_at'>>,
    at: Date,
  ): Promise<void> {
    await tx.permissions.update({ where: { id }, data: { ...change, updated_at: at } });
  }

  /** Each role of the company with the codes of its non-archived permissions. */
  async rolesWithCodes(tx: Tx): Promise<{ id: string; codes: string[] }[]> {
    const roles = await tx.roles.findMany({
      where: { archived_at: null },
      select: {
        id: true,
        role_permissions: {
          select: { permissions: { select: { code: true, archived_at: true } } },
        },
      },
      orderBy: { created_at: 'asc' },
    });
    return roles.map((role) => ({
      id: role.id,
      codes: role.role_permissions
        .filter((link) => link.permissions.archived_at === null)
        .map((link) => link.permissions.code),
    }));
  }

  async addPermissionsToRole(
    tx: Tx,
    roleId: string,
    permissionIds: readonly { id: string; linkId: string }[],
    at: Date,
  ): Promise<void> {
    await tx.role_permissions.createMany({
      data: permissionIds.map(({ id, linkId }) => ({
        id: linkId,
        role_id: roleId,
        permission_id: id,
        created_at: at,
      })),
    });
  }
}
