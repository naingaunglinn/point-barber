import { Injectable } from '@nestjs/common';
import { LeaveStatus, LeaveTypeStatus } from '@point/shared';
import { z } from 'zod';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import type { LeaveTypeRow } from '../leave-types/leave-type-mapper.js';

// The only writer of `leave_types` (ADR-001 rule 1 · module map · add-leave-types design D1 / D5 / D8).
// The list reads with the read client; locks and writes take the caller's transaction.

const COLUMNS = Prisma.sql`id, name_mm, name_en, is_paid, sort_order, status, archived_at, updated_at`;
const SELECT = {
  id: true,
  name_mm: true,
  name_en: true,
  is_paid: true,
  sort_order: true,
  status: true,
  archived_at: true,
  updated_at: true,
} as const;

const rowSchema = z.object({
  id: z.uuid(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  is_paid: z.boolean(),
  sort_order: z.int(),
  status: z.int(),
  archived_at: z.date().nullable(),
  updated_at: z.date(),
});
const nextSchema = z.object({ next: z.int() });

/** The members a create or an edit writes; a member left out is not written. */
export interface LeaveTypeWrite {
  readonly name_mm?: string;
  readonly name_en?: string | null;
  readonly is_paid?: boolean;
  readonly sort_order?: number;
  readonly status?: number;
}

@Injectable()
export class LeaveTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** P2.LVT.01 in the one order of design D8: `sort_order`, `name_mm` by code point, `id`. */
  async list(
    companyId: string,
    filter: { readonly statuses: readonly number[]; readonly includeArchived: boolean },
  ): Promise<LeaveTypeRow[]> {
    const rows = await this.prisma.$queryRaw<unknown[]>`
      SELECT ${COLUMNS} FROM leave_types
      WHERE company_id = ${companyId}::uuid AND status = ANY(${[...filter.statuses]}::smallint[])
        AND (${filter.includeArchived}::boolean OR archived_at IS NULL)
      ORDER BY sort_order, name_mm COLLATE "C", id`;
    return rows.map((row) => rowSchema.parse(row));
  }

  /** The company's type locked FOR UPDATE until commit (design D5); null when there is none. */
  async lockById(tx: Tx, companyId: string, id: string): Promise<LeaveTypeRow | null> {
    const rows = await tx.$queryRaw<unknown[]>`
      SELECT ${COLUMNS} FROM leave_types
      WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
    return rows.length === 0 ? null : rowSchema.parse(rows[0]);
  }

  /** LT1: the highest `sort_order` of the non-archived types + 1, or 1 when there is none. */
  async nextSortOrder(tx: Tx, companyId: string): Promise<number> {
    const rows = await tx.$queryRaw<unknown[]>`
      SELECT (coalesce(max(sort_order), 0) + 1)::int AS next FROM leave_types
      WHERE company_id = ${companyId}::uuid AND archived_at IS NULL`;
    return nextSchema.parse(rows[0]).next;
  }

  /** A new ACTIVE type; a taken Myanmar name violates `leave_types_name_active` (→ 409). */
  insert(
    tx: Tx,
    row: Required<Omit<LeaveTypeWrite, 'status'>> & {
      readonly id: string;
      readonly company_id: string;
      readonly at: Date;
    },
  ): Promise<LeaveTypeRow> {
    const { at, ...members } = row;
    return tx.leave_types.create({
      data: { ...members, status: LeaveTypeStatus.ACTIVE, created_at: at, updated_at: at },
      select: SELECT,
    });
  }

  /** Writes exactly the given members and `updated_at`. */
  updateMembers(tx: Tx, id: string, members: LeaveTypeWrite, at: Date): Promise<LeaveTypeRow> {
    return tx.leave_types.update({
      where: { id },
      data: { ...members, updated_at: at },
      select: SELECT,
    });
  }

  /** P2.LVT.04 — sets `archived_at`; nothing is deleted (D-DAT-05). */
  setArchived(tx: Tx, id: string, at: Date): Promise<LeaveTypeRow> {
    return tx.leave_types.update({
      where: { id },
      data: { archived_at: at, updated_at: at },
      select: SELECT,
    });
  }

  /** A PENDING leave references the type (P2.LVT.04 — Recorded reading 6); read after the lock. */
  async pendingLeaveExists(tx: Tx, id: string): Promise<boolean> {
    const leave = await tx.leaves.findFirst({
      where: { leave_type_id: id, status: LeaveStatus.PENDING },
      select: { id: true },
    });
    return leave !== null;
  }
}
