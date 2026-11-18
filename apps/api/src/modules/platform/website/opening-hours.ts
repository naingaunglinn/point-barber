import { Injectable } from '@nestjs/common';
import { type BranchHoursWeek, ErrorCode, toMmtIsoMillis } from '@point/shared';

import { ProblemException } from '../../../common/http/problem.exception.js';
import { isUuid } from '../../../common/http/uuid-v7.js';
import { type HoursRow, OpeningHoursRepository } from '../repositories/opening-hours.repository.js';
import { WebsitePeople } from './website-people.js';

// A branch's weekly opening hours (D-WEB-04): the receipt footer (AD-RCPT-01 · add-walkin-visit-checkout
// design D10) and the website's week (P8.WEB.03 · add-website-management design D5).

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
  constructor(
    private readonly repository: OpeningHoursRepository,
    private readonly people: WebsitePeople,
  ) {}

  /** The rows of one branch, Monday first; a weekday without a row is missing. */
  ofBranch(branchId: string): Promise<OpeningDay[]> {
    return this.repository.ofBranch(branchId);
  }

  /** The branch, or 404 `not_found` — an id that is no branch, or not a UUID. */
  async branch(branchId: string): Promise<{ readonly id: string; readonly code: string }> {
    const branch = isUuid(branchId) ? await this.people.branch(branchId) : null;
    if (branch === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    return branch;
  }

  /**
   * P8.WEB.03 — the week, Monday first, with the newest row's `updated_at` / `updated_by`; a branch
   * without rows answers `configured = false` and `days = []`.
   */
  async week(branchId: string): Promise<BranchHoursWeek> {
    await this.branch(branchId);
    return this.weekOf(branchId, await this.repository.weekOf(branchId));
  }

  /** The week of stored rows (the write answers with it too). */
  async weekOf(branchId: string, rows: readonly HoursRow[]): Promise<BranchHoursWeek> {
    const newest = newestOf(rows);
    const names =
      newest === undefined ? new Map<string, string>() : await this.people.userDisplayNames([newest.updated_by_user_id]);
    return {
      branch_id: branchId,
      configured: rows.length > 0,
      days: rows.map((row) => ({
        day_of_week: row.day_of_week,
        is_closed: row.is_closed,
        opens_at: row.opens_at,
        closes_at: row.closes_at,
      })),
      updated_at: newest === undefined ? null : toMmtIsoMillis(newest.updated_at),
      updated_by:
        newest === undefined
          ? null
          : {
              user_id: newest.updated_by_user_id,
              display_name: names.get(newest.updated_by_user_id) ?? '',
            },
    };
  }
}

/** The row changed last (P8-RULE-19 — the week's `updated_at`). */
export function newestOf(rows: readonly HoursRow[]): HoursRow | undefined {
  return rows.reduce<HoursRow | undefined>(
    (newest, row) => (newest === undefined || row.updated_at > newest.updated_at ? row : newest),
    undefined,
  );
}
