import { Injectable } from '@nestjs/common';
import { plusDays } from '@point/shared';

import { BranchClosuresRepository } from '../repositories/branch-closures.repository.js';

// The closed dates of branches (add-website-management design D1): the read the availability and the
// roster changes name (#30 / #33 / add-schedule-roster) and the public payloads use — first merge creates.

export interface ClosedDate {
  readonly branch_id: string;
  /** A business date `YYYY-MM-DD`. */
  readonly date: string;
  readonly notice_mm: string;
  readonly notice_en: string | null;
}

export interface ClosedDatesQuery {
  readonly branch_ids: readonly string[];
  readonly from: string;
  readonly to: string;
}

@Injectable()
export class BranchClosures {
  constructor(private readonly repository: BranchClosuresRepository) {}

  /**
   * One entry per closed date of the branches inside `[from, to]` — a non-archived closure over
   * 12/Oct – 13/Oct gives two entries. Ordered by date, then branch id.
   */
  async onDates(query: ClosedDatesQuery): Promise<ClosedDate[]> {
    if (query.branch_ids.length === 0 || query.to < query.from) return [];
    const rows = await this.repository.touching(query.branch_ids, query.from, query.to);
    const dates: ClosedDate[] = [];
    for (const row of rows) {
      const last = row.end_date < query.to ? row.end_date : query.to;
      for (
        let date = row.start_date > query.from ? row.start_date : query.from;
        date <= last;
        date = plusDays(date, 1)
      ) {
        dates.push({
          branch_id: row.branch_id,
          date,
          notice_mm: row.notice_mm,
          notice_en: row.notice_en,
        });
      }
    }
    return dates.sort((a, b) =>
      a.date === b.date ? (a.branch_id < b.branch_id ? -1 : 1) : a.date < b.date ? -1 : 1,
    );
  }
}
