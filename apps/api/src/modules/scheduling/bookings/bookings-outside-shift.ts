import { Injectable } from '@nestjs/common';
import { type ScheduleWarning, toMmtIso } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { type ActiveShift, ShiftsRepository } from '../repositories/shifts.repository.js';
import type { BookedBlock, BookedBlocksPort } from './booked-blocks.js';

// The booking warning of a shift change (P2-RULE-08 · D-BKG-19 · design D8): after a regeneration, every
// BOOKED booking of the employee on a changed date whose block is not inside the union of the employee's
// active shifts at the booking's branch that day (touching shifts merged — the definition availability
// uses, P2-RULE-10 step 3) is listed. Bookings are only read — none is cancelled, moved or edited.

interface Interval {
  readonly start: number;
  readonly end: number;
}

/** The shifts of one branch and date as one interval list, touching or overlapping ones joined. */
function merged(intervals: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const next of [...intervals].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = out.at(-1);
    if (last !== undefined && next.start <= last.end) {
      out[out.length - 1] = { start: last.start, end: Math.max(last.end, next.end) };
    } else {
      out.push(next);
    }
  }
  return out;
}

/** Pure: the `bookings_outside_shift` warning for `blocks` against `shifts`, or null. */
export function outsideShifts(
  blocks: readonly BookedBlock[],
  shifts: readonly ActiveShift[],
): ScheduleWarning | null {
  const items = blocks
    .filter((block) => {
      const day = merged(
        shifts
          .filter(
            (shift) =>
              shift.branch_id === block.branch_id && shift.shift_date === block.business_date,
          )
          .map((shift) => ({ start: shift.starts_at.getTime(), end: shift.ends_at.getTime() })),
      );
      const start = block.block_starts_at.getTime();
      const end = block.block_ends_at.getTime();
      return !day.some((shift) => start >= shift.start && end <= shift.end);
    })
    .sort(
      (a, b) =>
        a.starts_at.getTime() - b.starts_at.getTime() || a.booking_id.localeCompare(b.booking_id),
    )
    .map((block) => ({
      booking_id: block.booking_id,
      branch_id: block.branch_id,
      starts_at: toMmtIso(block.starts_at),
      ends_at: toMmtIso(block.ends_at),
    }));
  return items.length === 0 ? null : { code: 'bookings_outside_shift', items };
}

@Injectable()
export class BookingsOutsideShift {
  private port: BookedBlocksPort | undefined;

  constructor(private readonly shifts: ShiftsRepository) {}

  /** Called once by `booking` at start-up (ADR-001 rule 1 — `scheduling` never imports `booking`). */
  use(port: BookedBlocksPort): void {
    this.port = port;
  }

  /** `dates` = the dates a write changed; null when no booking is left outside the shifts. */
  async check(
    tx: Tx,
    employeeId: string,
    dates: readonly string[],
  ): Promise<ScheduleWarning | null> {
    if (dates.length === 0) return null;
    if (this.port === undefined) {
      throw new Error(
        'BookingsOutsideShift: no BookedBlocksPort registered (BookingModule not loaded)',
      );
    }
    const blocks = await this.port.forEmployeeDates(tx, { employee_id: employeeId, dates });
    if (blocks.length === 0) return null;
    return outsideShifts(blocks, await this.shifts.activeOn(tx, employeeId, dates));
  }
}
