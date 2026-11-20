import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import type { OpeningDay } from '../website/opening-hours.js';

// The branch_opening_hours table (Part 8 website content — the platform module owns it · D-WEB-04):
// the receipt footer's read (add-walkin-visit-checkout), and the website's week read and write
// (add-website-management P8.WEB.03 / 04 · design D5).

/** A stored weekday with its last change. */
export interface HoursRow extends OpeningDay {
  readonly id: string;
  readonly updated_at: Date;
  readonly updated_by_user_id: string;
}

/** The values a write stores for one weekday. */
export interface HoursWrite extends OpeningDay {
  readonly updated_by_user_id: string;
  readonly updated_at: Date;
}

@Injectable()
export class OpeningHoursRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  async ofBranch(branchId: string): Promise<OpeningDay[]> {
    const rows = await this.weekOf(branchId);
    return rows.map((row) => ({
      day_of_week: row.day_of_week,
      is_closed: row.is_closed,
      opens_at: row.opens_at,
      closes_at: row.closes_at,
    }));
  }

  /** The rows of one branch, Monday first, with their last change. */
  async weekOf(branchId: string): Promise<HoursRow[]> {
    const rows = await this.db.branch_opening_hours.findMany({
      where: { branch_id: branchId },
      orderBy: { day_of_week: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      day_of_week: row.day_of_week,
      is_closed: row.is_closed,
      opens_at: timeOfDay(row.opens_at),
      closes_at: timeOfDay(row.closes_at),
      updated_at: row.updated_at,
      updated_by_user_id: row.updated_by_user_id,
    }));
  }

  /** The branch's rows locked for the write (CG-DB-06 · design D5). */
  async lockWeek(tx: Tx, branchId: string): Promise<HoursRow[]> {
    const rows = await tx.$queryRaw<HoursRow[]>`
      SELECT id, day_of_week, is_closed, to_char(opens_at, 'HH24:MI') AS opens_at,
             to_char(closes_at, 'HH24:MI') AS closes_at, updated_at, updated_by_user_id
      FROM branch_opening_hours WHERE branch_id = ${branchId}::uuid
      ORDER BY day_of_week FOR UPDATE`;
    return rows;
  }

  async insertDay(tx: Tx, id: string, branchId: string, day: HoursWrite): Promise<void> {
    await tx.branch_opening_hours.create({ data: { id, branch_id: branchId, ...columns(day) } });
  }

  async updateDay(tx: Tx, id: string, day: HoursWrite): Promise<void> {
    await tx.branch_opening_hours.update({ where: { id }, data: columns(day) });
  }
}

function columns(day: HoursWrite) {
  return {
    day_of_week: day.day_of_week,
    is_closed: day.is_closed,
    opens_at: timeColumn(day.opens_at),
    closes_at: timeColumn(day.closes_at),
    updated_by_user_id: day.updated_by_user_id,
    updated_at: day.updated_at,
  };
}

/** A `time` column arrives as a Date on 1970-01-01 UTC; the wire form is `HH:MM` (API-DATA-03). */
function timeOfDay(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(11, 16);
}

/** `HH:MM` → the Date a `time` column takes (1970-01-01 UTC). */
function timeColumn(value: string | null): Date | null {
  return value === null ? null : new Date(`1970-01-01T${value}:00.000Z`);
}
