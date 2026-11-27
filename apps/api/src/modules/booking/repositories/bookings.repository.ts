import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';

// Reads of the bookings table (ADR-001 rule 1 — the booking module owns Part 3's bookings). The
// booking endpoints come with the Part 3 change; add-branch-management needs only the count below.

/** Open bookings: 1 BOOKED or 2 STARTED (D-BKG-18 — Cancelled and Completed are final). */
const OPEN = [BookingStatus.BOOKED, BookingStatus.STARTED];

@Injectable()
export class BookingsRepository {
  /** The open bookings of a branch, whatever their date (P1-RULE-09 · proposal reading 2). */
  openAt(tx: Tx, branchId: string): Promise<number> {
    return tx.bookings.count({ where: { branch_id: branchId, status: { in: OPEN } } });
  }

  /** The BOOKED bookings of the employee on `dates` (add-schedule-patterns D8), by start. */
  async bookedOn(tx: Tx, employeeId: string, dates: readonly string[]): Promise<BookedBlockRow[]> {
    return tx.bookings.findMany({
      where: {
        booked_employee_id: employeeId,
        status: BookingStatus.BOOKED,
        business_date: { in: dates.map((date) => new Date(`${date}T00:00:00Z`)) },
      },
      orderBy: [{ starts_at: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        booked_employee_id: true,
        branch_id: true,
        status: true,
        business_date: true,
        starts_at: true,
        ends_at: true,
        block_starts_at: true,
        block_ends_at: true,
        customer_name: true,
      },
    });
  }
}

/** The columns of one booking the schedule reads. */
export interface BookedBlockRow {
  readonly id: string;
  readonly booked_employee_id: string;
  readonly branch_id: string;
  readonly status: number;
  readonly business_date: Date;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly block_starts_at: Date;
  readonly block_ends_at: Date;
  readonly customer_name: string;
}
