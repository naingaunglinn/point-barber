import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import type { BookedBlock, BookedBlocksPort } from '../../scheduling/index.js';
import { BookingsRepository } from '../repositories/bookings.repository.js';

// The booking side of the port `scheduling` declares (add-schedule-patterns design D1 · D8 · ADR-001 rule 1):
// the BOOKED (status 1) rows of one employee on given Myanmar dates, as `BookedBlock`. `BookingModule`
// registers it at start-up; `scheduling` never imports `booking`.
@Injectable()
export class BookedBlocks implements BookedBlocksPort {
  constructor(private readonly bookings: BookingsRepository) {}

  async forEmployeeDates(
    db: Tx,
    query: { readonly employee_id: string; readonly dates: readonly string[] },
  ): Promise<BookedBlock[]> {
    if (query.dates.length === 0) return [];
    const rows = await this.bookings.bookedOn(db, query.employee_id, query.dates);
    return rows.map((row) => ({
      booking_id: row.id,
      booked_employee_id: row.booked_employee_id,
      branch_id: row.branch_id,
      status: row.status,
      business_date: row.business_date.toISOString().slice(0, 10),
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      block_starts_at: row.block_starts_at,
      block_ends_at: row.block_ends_at,
      customer_name: row.customer_name,
    }));
  }
}
