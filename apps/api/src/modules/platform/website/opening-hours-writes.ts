import { Injectable } from '@nestjs/common';
import { type BranchHoursWeek, type BranchHoursWriteBody, ErrorCode } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Audit } from '../audit/audit.service.js';
import { type HoursRow, OpeningHoursRepository } from '../repositories/opening-hours.repository.js';
import { OpeningHours, type OpeningDay, newestOf } from './opening-hours.js';
import { SiteContent } from './site-content.js';

// P8.WEB.04 — a branch's week (P8-RULE-12 · P8-RULE-19 · P7-RULE-03 · add-website-management design
// D5): the schema has checked the seven days and each day's times (owner WM3); here, in one
// transaction, the branch's rows are locked, a stale `expected_updated_at` is refused, and only the
// weekdays that change are written — a branch without rows gets seven inserts. A write that changes
// something queues one `site.revalidate` for the home page and the branch page and leaves one audit row
// with the changed weekdays; a week equal to the stored one writes nothing.

export const WEBSITE_HOURS_UPDATE = 'website.hours_update';

const sameDay = (stored: OpeningDay, sent: OpeningDay): boolean =>
  stored.is_closed === sent.is_closed &&
  stored.opens_at === sent.opens_at &&
  stored.closes_at === sent.closes_at;

const valuesOf = (day: OpeningDay) => ({
  is_closed: day.is_closed,
  opens_at: day.opens_at,
  closes_at: day.closes_at,
});

@Injectable()
export class OpeningHoursWrites {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repository: OpeningHoursRepository,
    private readonly hours: OpeningHours,
    private readonly site: SiteContent,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  saveWeek(branchId: string, body: BranchHoursWriteBody): Promise<BranchHoursWeek> {
    const actor = RequestContext.current()?.user_id;
    if (actor === undefined) throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
    return this.runner.run(async (tx) => {
      const branch = await this.hours.branch(branchId);
      const stored = await this.repository.lockWeek(tx, branchId);
      const newest = newestOf(stored);
      const expected = body.expected_updated_at;
      if (
        expected !== undefined &&
        expected !== null &&
        newest !== undefined &&
        new Date(expected).getTime() < newest.updated_at.getTime()
      ) {
        throw new ProblemException(ErrorCode.CONFLICT, 409);
      }
      const byWeekday = new Map<number, HoursRow>(stored.map((row) => [row.day_of_week, row]));
      const changed = body.days
        .map((day) => ({ day, row: byWeekday.get(day.day_of_week) }))
        .filter(({ day, row }) => row === undefined || !sameDay(row, day))
        .sort((a, b) => a.day.day_of_week - b.day.day_of_week);
      if (changed.length === 0) {
        this.audit.skip();
        return this.hours.weekOf(branchId, stored);
      }
      const now = this.clock.now();
      for (const { day, row } of changed) {
        const write = {
          ...valuesOf(day),
          day_of_week: day.day_of_week,
          updated_by_user_id: actor,
          updated_at: now,
        };
        if (row === undefined)
          await this.repository.insertDay(tx, uuidV7(now.getTime()), branchId, write);
        else await this.repository.updateDay(tx, row.id, write);
      }
      await this.site.touch(tx, ['home', `branch:${branch.code}`]);
      await this.audit.emit({
        action: WEBSITE_HOURS_UPDATE,
        entity_type: 'branch_opening_hours',
        entity_id: branchId,
        branch_id: branchId,
        before: Object.fromEntries(
          changed.map(({ day, row }) => [
            String(day.day_of_week),
            row === undefined ? null : valuesOf(row),
          ]),
        ),
        after: Object.fromEntries(
          changed.map(({ day }) => [String(day.day_of_week), valuesOf(day)]),
        ),
      });
      return this.hours.weekOf(branchId, await this.repository.weekOf(branchId));
    });
  }
}
