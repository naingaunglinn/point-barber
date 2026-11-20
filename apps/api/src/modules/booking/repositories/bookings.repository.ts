import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@point/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import type { BookedInRange, BookedRange } from '../reads/booking-reads.js';

// Reads of the bookings table (ADR-001 rule 1 — the booking module owns Part 3's bookings). The
// booking endpoints come with the Part 3 change; add-branch-management needs only the count below.

/** Open bookings: 1 BOOKED or 2 STARTED (D-BKG-18 — Cancelled and Completed are final). */
const OPEN = [BookingStatus.BOOKED, BookingStatus.STARTED];

@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  /** The business dates of the range as the `date` column takes them. */
  private where(range: BookedRange) {
    return {
      branch_id: range.branch_id,
      status: BookingStatus.BOOKED,
      business_date: {
        gte: new Date(`${range.from}T00:00:00.000Z`),
        lte: new Date(`${range.to}T00:00:00.000Z`),
      },
    };
  }

  /** BOOKED bookings with a business date in the range, by `starts_at` then id (D-BKG-18). */
  async bookedInRange(range: BookedRange & { readonly take: number }): Promise<BookedInRange[]> {
    const rows = await this.db.bookings.findMany({
      where: this.where(range),
      orderBy: [{ starts_at: 'asc' }, { id: 'asc' }],
      take: range.take,
      select: {
        id: true,
        starts_at: true,
        booked_employee_id: true,
        customer_name: true,
        customers: { select: { phone_normalized: true } },
      },
    });
    return rows.map((row) => ({
      booking_id: row.id,
      starts_at: row.starts_at,
      employee_id: row.booked_employee_id,
      customer_name: row.customer_name,
      // E.164, as stored (D-CUS-02 · proposal reading 8).
      customer_phone: row.customers.phone_normalized,
    }));
  }

  countBookedInRange(range: BookedRange): Promise<number> {
    return this.db.bookings.count({ where: this.where(range) });
  }

  /** The open bookings of a branch, whatever their date (P1-RULE-09 · proposal reading 2). */
  openAt(tx: Tx, branchId: string): Promise<number> {
    return tx.bookings.count({ where: { branch_id: branchId, status: { in: OPEN } } });
  }
}
