import { Injectable } from '@nestjs/common';
import {
  type ClosureCreateBody,
  type ClosureResult,
  ErrorCode,
  type FieldError,
  isZawgyi,
  todayMmt,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { isClosureOverlap } from '../../../common/database/errors.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Audit } from '../audit/audit.service.js';
import { BranchClosuresRepository } from '../repositories/branch-closures.repository.js';
import { AffectedBookings } from './affected-bookings.js';
import { closureDateProblem } from './closure-rules.js';
import { ClosureViews } from './closure-view.js';
import { SiteContent } from './site-content.js';

// P8.WEB.06 — a closure is created (P8-RULE-12 · P7-RULE-03 · owner F8 · design D6): in one transaction
// the branch row is held `FOR SHARE` (it exists, its code is read), the dates are checked on today, the
// overlap pre-check runs, the row is inserted — the exclusion constraint decides a race — the bookings
// inside are listed (never cancelled), the home page and the branch page are queued for a refresh and
// one audit row is left. The events after commit and the booking-options cache come with part A4.

export const WEBSITE_CLOSURE_CREATE = 'website.closure_create';

/** The members of a closure body that hold Myanmar or English text (API-SHAPE-05). */
const TEXT_MEMBERS = ['notice_mm', 'notice_en'] as const;

/** Every text member with Zawgyi text, one `errors[]` item each. */
function zawgyiFields(body: ClosureCreateBody): FieldError[] {
  return TEXT_MEMBERS.filter((member) => {
    const text = body[member];
    return typeof text === 'string' && isZawgyi(text);
  }).map((field) => ({ field, code: ErrorCode.ZAWGYI_TEXT }));
}

@Injectable()
export class ClosureWrites {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repository: BranchClosuresRepository,
    private readonly affected: AffectedBookings,
    private readonly views: ClosureViews,
    private readonly site: SiteContent,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  async create(body: ClosureCreateBody): Promise<ClosureResult> {
    const actor = RequestContext.current()?.user_id;
    if (actor === undefined) throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
    const zawgyi = zawgyiFields(body);
    if (zawgyi.length > 0) {
      throw new ProblemException(ErrorCode.ZAWGYI_TEXT, 400, { errors: zawgyi });
    }
    const now = this.clock.now();
    const today = todayMmt(now);
    const notice_en = body.notice_en === undefined || body.notice_en === '' ? null : body.notice_en;
    try {
      return await this.runner.run(async (tx) => {
        // The order of the checks is the proposal's reading 6: the branch, the dates, the overlap.
        const branch = await this.repository.shareBranch(tx, body.branch_id);
        if (branch === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
        const problem = closureDateProblem(body.start_date, body.end_date, today);
        if (problem !== null) {
          throw new ProblemException(problem.code, 422, {
            ...(problem.context === undefined ? {} : { context: problem.context }),
          });
        }
        const overlapping = await this.repository.overlapping(
          body.branch_id,
          body.start_date,
          body.end_date,
        );
        if (overlapping !== null) throw overlap(overlapping);
        const row = await this.repository.insert(tx, {
          id: uuidV7(now.getTime()),
          branch_id: body.branch_id,
          start_date: body.start_date,
          end_date: body.end_date,
          notice_mm: body.notice_mm,
          notice_en,
          created_by_user_id: actor,
          now,
        });
        const { affected_bookings, warnings } = await this.affected.of(
          row.branch_id,
          row.start_date,
          row.end_date,
        );
        await this.site.touch(tx, ['home', `branch:${branch.code}`]);
        await this.audit.emit({
          action: WEBSITE_CLOSURE_CREATE,
          entity_type: 'branch_closures',
          entity_id: row.id,
          branch_id: row.branch_id,
          before: null,
          after: {
            start_date: row.start_date,
            end_date: row.end_date,
            notice_mm: row.notice_mm,
            notice_en: row.notice_en,
          },
        });
        const [closure] = await this.views.of([row], today);
        if (closure === undefined)
          throw new Error('ClosureWrites.create: the view lost the closure');
        return { closure, affected_bookings, warnings };
      });
    } catch (error) {
      // A race the pre-check missed: the exclusion constraint refused the insert and the transaction
      // is gone, so the other closure's id is read outside it.
      if (!isClosureOverlap(error)) throw error;
      const other = await this.repository.overlapping(
        body.branch_id,
        body.start_date,
        body.end_date,
      );
      throw overlap(other);
    }
  }
}

/** 409 `closure_overlap` naming the closure in the way (`context.closure_id`). */
function overlap(closureId: string | null): ProblemException {
  return new ProblemException(ErrorCode.CLOSURE_OVERLAP, 409, {
    ...(closureId === null ? {} : { context: { closure_id: closureId } }),
  });
}
