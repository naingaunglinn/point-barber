import { Injectable } from '@nestjs/common';

import { OpeningHoursRepository } from '../repositories/opening-hours.repository.js';

// A branch's weekly opening hours (D-WEB-04): the receipt footer (AD-RCPT-01 · add-walkin-visit-checkout
// design D10); the website and its editor come with their own changes.

export interface OpeningDay {
  /** 1 Mon … 7 Sun (ISO). */
  readonly day_of_week: number;
  readonly is_closed: boolean;
  /** A time of day `09:00`; null on a closed day. */
  readonly opens_at: string | null;
  readonly closes_at: string | null;
}

@Injectable()
export class OpeningHours {
  constructor(private readonly repository: OpeningHoursRepository) {}

  /** The rows of one branch, Monday first; a weekday without a row is missing. */
  ofBranch(branchId: string): Promise<OpeningDay[]> {
    return this.repository.ofBranch(branchId);
  }
}
