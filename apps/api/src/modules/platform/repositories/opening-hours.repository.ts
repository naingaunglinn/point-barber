import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import type { OpeningDay } from '../website/opening-hours.js';

// The branch_opening_hours table (Part 8 website content — the platform module owns it · D-WEB-04).
@Injectable()
export class OpeningHoursRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  async ofBranch(branchId: string): Promise<OpeningDay[]> {
    const rows = await this.db.branch_opening_hours.findMany({
      where: { branch_id: branchId },
      orderBy: { day_of_week: 'asc' },
      select: { day_of_week: true, is_closed: true, opens_at: true, closes_at: true },
    });
    return rows.map((row) => ({
      day_of_week: row.day_of_week,
      is_closed: row.is_closed,
      opens_at: timeOfDay(row.opens_at),
      closes_at: timeOfDay(row.closes_at),
    }));
  }
}

/** A `time` column arrives as a Date on 1970-01-01 UTC; the wire form is `HH:MM` (API-DATA-03). */
function timeOfDay(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(11, 16);
}
