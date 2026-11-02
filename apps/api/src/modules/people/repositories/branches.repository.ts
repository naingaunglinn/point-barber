import { Injectable } from '@nestjs/common';
import type { SocialLinks } from '@point/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Tx } from '../../../common/database/transaction-runner.js';

// The branch rows of add-branch-management (design D1 · ADR-001 rule 1 — people owns branches and
// employee_branches). Reads outside a transaction use the read client; writes take the caller's
// transaction.

/** The stored members of a branch as the service compares and answers them. */
export interface BranchRow {
  readonly id: string;
  readonly code: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address_mm: string | null;
  readonly address_en: string | null;
  readonly website_url: string | null;
  /** The stored jsonb, NULL when the branch has no links (answered as `{}`). */
  readonly social_links: unknown;
  /** numeric(10,7) as its 7-place decimal text, e.g. `16.8409000`. */
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly location_radius_meters: number | null;
  readonly is_public: boolean;
  readonly map_url: string | null;
  readonly status: number;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** The members a create or update writes; a member left out is not written. */
export interface BranchWrite {
  readonly name_mm?: string;
  readonly name_en?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly address_mm?: string | null;
  readonly address_en?: string | null;
  readonly website_url?: string | null;
  readonly social_links?: SocialLinks;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly location_radius_meters?: number | null;
  readonly is_public?: boolean;
  readonly map_url?: string | null;
  readonly status?: number;
}

const BRANCH = {
  id: true,
  code: true,
  name_mm: true,
  name_en: true,
  phone: true,
  email: true,
  address_mm: true,
  address_en: true,
  website_url: true,
  social_links: true,
  latitude: true,
  longitude: true,
  location_radius_meters: true,
  is_public: true,
  map_url: true,
  status: true,
  created_at: true,
  updated_at: true,
} as const;

interface DecimalLike {
  toFixed(digits: number): string;
}

const decimal = (value: DecimalLike | null): string | null =>
  value === null ? null : value.toFixed(7);

/** A `date` column holds a Myanmar calendar date; Prisma reads and writes it at UTC midnight. */
const day = (date: string): Date => new Date(`${date}T00:00:00Z`);

/** An assignment active on `date`: effective_from ≤ date ≤ coalesce(effective_to, date) (D-EMP-01). */
const activeOn = (branchId: string, date: string) => ({
  branch_id: branchId,
  effective_from: { lte: day(date) },
  OR: [{ effective_to: null }, { effective_to: { gte: day(date) } }],
});

@Injectable()
export class BranchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The branch, or null for an id that is no branch. */
  async detailRow(id: string, db: Tx | PrismaService = this.prisma): Promise<BranchRow | null> {
    const row = await db.branches.findUnique({ where: { id }, select: BRANCH });
    return row === null
      ? null
      : { ...row, latitude: decimal(row.latitude), longitude: decimal(row.longitude) };
  }

  /** The branch row locked FOR UPDATE until commit (design D3); null when there is none. */
  async lockById(tx: Tx, id: string): Promise<BranchRow | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM branches WHERE id = ${id}::uuid FOR UPDATE`;
    return locked.length === 0 ? null : this.detailRow(id, tx);
  }

  /** A new branch row; a code the company already has violates branches_company_id_code_idx. */
  async insert(
    tx: Tx,
    row: BranchWrite & {
      readonly id: string;
      readonly company_id: string;
      readonly code: string;
      readonly name_mm: string;
      readonly at: Date;
    },
  ): Promise<void> {
    const { at, ...members } = row;
    await tx.branches.create({
      data: { ...members, created_at: at, updated_at: at },
    });
  }

  /** Writes exactly the given members and `updated_at` (design D3). */
  async updateMembers(tx: Tx, id: string, members: BranchWrite, at: Date): Promise<void> {
    await tx.branches.update({ where: { id }, data: { ...members, updated_at: at } });
  }

  /** The distinct employees with an assignment at the branch active on `date` (proposal reading 4). */
  async activeEmployees(id: string, date: string, db: Tx | PrismaService = this.prisma) {
    const rows = await db.employee_branches.findMany({
      where: activeOn(id, date),
      distinct: ['employee_id'],
      select: { employee_id: true },
    });
    return rows.length;
  }

  /** The assignments at the branch active on `date` (P1-RULE-09 — proposal reading 3). */
  activeAssignments(tx: Tx, id: string, date: string): Promise<number> {
    return tx.employee_branches.count({ where: activeOn(id, date) });
  }
}
