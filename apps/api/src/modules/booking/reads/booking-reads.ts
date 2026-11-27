import { Injectable } from '@nestjs/common';

import { BookingsRepository } from '../repositories/bookings.repository.js';

// The public reads of the bookings table other modules may use (CG-ARCH-01 · ADR-001 rule 1).
// add-website-management design D1 / D7: the BOOKED bookings inside a closure's dates.

/** A BOOKED booking of a branch; the customer as stored on the booking and the customer row. */
export interface BookedInRange {
  readonly booking_id: string;
  readonly starts_at: Date;
  readonly employee_id: string;
  readonly customer_name: string;
  readonly customer_phone: string;
}

/** The business dates `[from, to]` of one branch (`YYYY-MM-DD`, both ends count). */
export interface BookedRange {
  readonly branch_id: string;
  readonly from: string;
  readonly to: string;
}

@Injectable()
export class BookingReads {
  constructor(private readonly repository: BookingsRepository) {}

  /** BOOKED bookings with a business date inside the range, earliest `starts_at` first, at most `take`. */
  bookedInRange(range: BookedRange & { readonly take: number }): Promise<BookedInRange[]> {
    return this.repository.bookedInRange(range);
  }

  /** How many BOOKED bookings the range holds. */
  countBookedInRange(range: BookedRange): Promise<number> {
    return this.repository.countBookedInRange(range);
  }
}
