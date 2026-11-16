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
}
