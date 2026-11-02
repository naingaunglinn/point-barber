import { Injectable } from '@nestjs/common';
import type { CompanyProfileChanges } from '@point/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import type { Prisma } from '../../../generated/prisma/client.js';

/** The profile columns of the company row (DB Part 1 v3.4 `companies` — P1.CO.01). */
export interface CompanyProfileRow {
  readonly id: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly logo_url: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address_mm: string | null;
  readonly address_en: string | null;
  readonly website_url: string | null;
  readonly social_links: Prisma.JsonValue | null;
  readonly status: number;
  readonly updated_at: Date;
}

const PROFILE = {
  id: true,
  name_mm: true,
  name_en: true,
  logo_url: true,
  phone: true,
  email: true,
  address_mm: true,
  address_en: true,
  website_url: true,
  social_links: true,
  status: true,
  updated_at: true,
} as const;

/** The one company (D-ORG-03): the oldest row. */
const ONE_COMPANY = [{ created_at: 'asc' }, { id: 'asc' }] as const;

// The company row and its roles (D-ORG-03 · D-ROLE-09); the profile of add-company-profile (design D2).
@Injectable()
export class CompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? TransactionScope.current()?.tx ?? this.prisma;
  }

  /** The one company (D-ORG-03): the oldest row; null before the base seed. */
  async companyId(tx?: Tx): Promise<string | null> {
    const row = await this.db(tx).companies.findFirst({
      orderBy: [...ONE_COMPANY],
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** The company's profile; null before the base seed. */
  profile(tx?: Tx): Promise<CompanyProfileRow | null> {
    return this.db(tx).companies.findFirst({ orderBy: [...ONE_COMPANY], select: PROFILE });
  }

  /**
   * The company row locked FOR UPDATE, then read again — under READ COMMITTED the read sees the row
   * as the last writer committed it (P1.CO.02 · add-company-profile design D3 step 1).
   */
  async lockProfile(tx: Tx): Promise<CompanyProfileRow> {
    const id = await this.companyId(tx);
    if (id === null)
      throw new Error('no company row yet — the base seed runs at the first API start');
    await tx.$queryRaw`SELECT id FROM companies WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.companies.findUniqueOrThrow({ where: { id }, select: PROFILE });
  }

  /** Writes the changed profile members and `updated_at` (set by the API — design D3 step 5). */
  updateProfile(
    tx: Tx,
    id: string,
    changes: CompanyProfileChanges,
    at: Date,
  ): Promise<CompanyProfileRow> {
    const { social_links: links, ...text } = changes;
    return tx.companies.update({
      where: { id },
      data: { ...text, ...(links === undefined ? {} : { social_links: links }), updated_at: at },
      select: PROFILE,
    });
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
