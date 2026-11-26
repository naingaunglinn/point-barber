import type { Tx } from '../../../common/database/transaction-runner.js';

// The port from `scheduling` to the bookings (add-schedule-patterns design D1 · D8 · ADR-001 rule 1):
// `scheduling` never imports `booking`, because `booking` will import `scheduling` (availability, the
// calendar's roster read). The port is declared here and implemented by `booking`'s `BookedBlocks`, which
// registers itself at start-up through `BookingsOutsideShift.use`. `BookedBlock` is the one row type of
// every method of the port (`forEmployeeDates` here; `busyBlocks` — #33; `forBranchDates`, `itemsOf` —
// add-schedule-roster).

/** One booking of an employee, as the schedule reads it. */
export interface BookedBlock {
  readonly booking_id: string;
  readonly booked_employee_id: string;
  readonly branch_id: string;
  /** `bookings.status` — 1 BOOKED for every row this change reads. */
  readonly status: number;
  /** The Myanmar calendar date of the booking, `YYYY-MM-DD`. */
  readonly business_date: string;
  readonly starts_at: Date;
  readonly ends_at: Date;
  /** The time the booking occupies the barber: the services plus the buffers (D-BKG-19). */
  readonly block_starts_at: Date;
  readonly block_ends_at: Date;
  readonly customer_name: string;
}

export interface BookedBlocksPort {
  /** The BOOKED (status 1) bookings of the employee whose `business_date` is one of `dates`. */
  forEmployeeDates(
    db: Tx,
    query: { readonly employee_id: string; readonly dates: readonly string[] },
  ): Promise<BookedBlock[]>;
}
