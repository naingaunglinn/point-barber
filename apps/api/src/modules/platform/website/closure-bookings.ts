import { Injectable } from '@nestjs/common';

// What the closures need from the booking module (add-website-management design D1 · D7 · ADR-001 rule 1):
// `booking` builds on `platform`, so it registers `BookingReads` here at start-up, as `people` does for
// `WebsitePeople`.

/** A BOOKED booking inside a closure's dates. */
export interface BookedInRange {
  readonly booking_id: string;
  readonly starts_at: Date;
  readonly employee_id: string;
  readonly customer_name: string;
  readonly customer_phone: string;
}

/** The business dates `[from, to]` of one branch (both ends count). */
export interface BookedRange {
  readonly branch_id: string;
  readonly from: string;
  readonly to: string;
}

export interface ClosureBookingReads {
  /** BOOKED bookings with a business date inside, earliest `starts_at` first, at most `take` rows. */
  bookedInRange(range: BookedRange & { readonly take: number }): Promise<BookedInRange[]>;
  /** How many BOOKED bookings the range holds. */
  countBookedInRange(range: BookedRange): Promise<number>;
}

@Injectable()
export class ClosureBookings implements ClosureBookingReads {
  private reads: ClosureBookingReads | undefined;

  use(reads: ClosureBookingReads): void {
    this.reads = reads;
  }

  bookedInRange(range: BookedRange & { readonly take: number }): Promise<BookedInRange[]> {
    return this.registered().bookedInRange(range);
  }

  countBookedInRange(range: BookedRange): Promise<number> {
    return this.registered().countBookedInRange(range);
  }

  private registered(): ClosureBookingReads {
    if (this.reads === undefined)
      throw new Error('ClosureBookings: nothing registered (BookingModule not loaded)');
    return this.reads;
  }
}
