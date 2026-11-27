import { Injectable } from '@nestjs/common';
import {
  type ArchiveRequestBody,
  type BranchClosure,
  type ClosureCreateBody,
  type ClosureResult,
  type ClosureUpdateBody,
  ErrorCode,
  type FieldError,
  isZawgyi,
  toMmtIsoMillis,
  todayMmt,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { isClosureOverlap } from '../../../common/database/errors.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Audit } from '../audit/audit.service.js';
import {
  BranchClosuresRepository,
  type ClosureChange,
  type ClosureRow,
} from '../repositories/branch-closures.repository.js';
import { AffectedBookings } from './affected-bookings.js';
import { ClosureEffects } from './closure-effects.js';
import { closureArchiveProblem, closureDateProblem, closureEditProblem } from './closure-rules.js';
import { ClosureViews } from './closure-view.js';
import { SiteContent } from './site-content.js';

// P8.WEB.06 – 08 — a closure is created, edited and archived (P8-RULE-12 · P7-RULE-03 · owner F8 ·
// design D6): in one transaction the branch row (create) or the closure row (edit, archive) is held,
// the dates are checked on today in the order of proposal reading 6, the overlap pre-check runs — the
// exclusion constraint decides a race — the bookings inside are listed (never cancelled), the home page
// and the branch page are queued for a refresh, one audit row is left and `schedule.changed` is
// collected; after the commit the booking-options cache is told. A refusal, a rollback and a write that
// changes nothing leave none of these.

export const WEBSITE_CLOSURE_CREATE = 'website.closure_create';
export const WEBSITE_CLOSURE_UPDATE = 'website.closure_update';
export const WEBSITE_CLOSURE_ARCHIVE = 'website.closure_archive';

/** The members of a closure body that hold Myanmar or English text (API-SHAPE-05). */
const TEXT_MEMBERS = ['notice_mm', 'notice_en'] as const;

/** Every text member with Zawgyi text, one `errors[]` item each. */
function zawgyiFields(body: {
  readonly notice_mm?: string;
  readonly notice_en?: string | null;
}): FieldError[] {
  return TEXT_MEMBERS.filter((member) => {
    const text = body[member];
    return typeof text === 'string' && isZawgyi(text);
  }).map((field) => ({ field, code: ErrorCode.ZAWGYI_TEXT }));
}

/** `notice_en` as stored: a blank English notice is no notice. */
const storedNotice = (text: string | null | undefined): string | null =>
  text === undefined || text === null || text === '' ? null : text;

@Injectable()
export class ClosureWrites {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repository: BranchClosuresRepository,
    private readonly affected: AffectedBookings,
    private readonly views: ClosureViews,
    private readonly site: SiteContent,
    private readonly effects: ClosureEffects,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  async create(body: ClosureCreateBody): Promise<ClosureResult> {
    const actor = this.actor();
    const zawgyi = zawgyiFields(body);
    if (zawgyi.length > 0) {
      throw new ProblemException(ErrorCode.ZAWGYI_TEXT, 400, { errors: zawgyi });
    }
    const now = this.clock.now();
    const today = todayMmt(now);
    const notice_en = storedNotice(body.notice_en);
    let result: ClosureResult;
    try {
      result = await this.runner.run(async (tx) => {
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
        this.effects.collect(row.branch_id, [row]);
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
      if (!isClosureOverlap(error)) throw error;
      throw await this.raceOverlap(body);
    }
    this.effects.committed(body.branch_id);
    return result;
  }

  /**
   * P8.WEB.07 — an edit by the closure's state (owner WM4 ★). The order of reading 6: not found,
   * archived, stale, then the date rules of `closureEditProblem`, then the overlap with the others.
   */
  async update(closureId: string, body: ClosureUpdateBody): Promise<ClosureResult> {
    this.actor();
    const zawgyi = zawgyiFields(body);
    if (zawgyi.length > 0) {
      throw new ProblemException(ErrorCode.ZAWGYI_TEXT, 400, { errors: zawgyi });
    }
    const now = this.clock.now();
    const today = todayMmt(now);
    // What the overlap-race catch needs once the transaction is gone.
    let saved: { branch_id: string; start_date: string; end_date: string } | undefined;
    let done: { result: ClosureResult; changed: boolean };
    try {
      done = await this.runner.run(async (tx) => {
        const locked = await this.repository.lockForUpdate(tx, closureId);
        if (locked === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
        const { closure: stored, branch_code } = locked;
        if (stored.archived_at !== null) {
          throw new ProblemException(ErrorCode.INVALID_TRANSITION, 409);
        }
        if (new Date(body.expected_updated_at).getTime() < stored.updated_at.getTime()) {
          throw new ProblemException(ErrorCode.CONFLICT, 409);
        }
        const merged = {
          start_date: body.start_date ?? stored.start_date,
          end_date: body.end_date ?? stored.end_date,
        };
        saved = { branch_id: stored.branch_id, ...merged };
        const problem = closureEditProblem(stored, merged, today);
        if (problem?.status === 400) {
          // The merged end is before the merged start: the schema cannot see it (both are optional).
          throw new ProblemException(ErrorCode.VALIDATION, 400, {
            errors: [{ field: 'end_date', code: problem.code }],
          });
        }
        if (problem !== null) {
          throw new ProblemException(problem.code, 422, {
            ...(problem.context === undefined ? {} : { context: problem.context }),
          });
        }
        const change = changeOf(stored, merged, body, now);
        const members = Object.keys(change).filter(isChangedMember);
        if (members.length === 0) {
          // Nothing changes: no row, no job, no event, no audit row (the no-op rule).
          this.audit.skip();
          return { result: await this.resultOf(stored, today), changed: false };
        }
        const overlapping = await this.repository.overlapping(
          stored.branch_id,
          merged.start_date,
          merged.end_date,
          stored.id,
        );
        if (overlapping !== null) throw overlap(overlapping);
        const row = await this.repository.update(tx, stored.id, change);
        const datesMoved = change.start_date !== undefined || change.end_date !== undefined;
        await this.site.touch(tx, ['home', `branch:${branch_code}`]);
        this.effects.collect(row.branch_id, datesMoved ? [stored, row] : [row]);
        await this.audit.emit({
          action: WEBSITE_CLOSURE_UPDATE,
          entity_type: 'branch_closures',
          entity_id: row.id,
          branch_id: row.branch_id,
          before: auditMembers(stored, members),
          after: auditMembers(row, members),
        });
        return { result: await this.resultOf(row, today), changed: true };
      });
    } catch (error) {
      if (!isClosureOverlap(error) || saved === undefined) throw error;
      throw await this.raceOverlap(saved, closureId);
    }
    if (done.changed) this.effects.committed(done.result.closure.branch_id);
    return done.result;
  }

  /**
   * P8.WEB.08 — delete = archive (D-DAT-05): only while no past day changes. An archived closure
   * answers 200 as it is and writes nothing.
   */
  async archive(closureId: string, body: ArchiveRequestBody): Promise<BranchClosure> {
    this.actor();
    const now = this.clock.now();
    const today = todayMmt(now);
    const reason = body.reason?.trim() ?? '';
    const done = await this.runner.run(async (tx) => {
      const locked = await this.repository.lockForUpdate(tx, closureId);
      if (locked === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
      const { closure: stored, branch_code } = locked;
      if (stored.archived_at !== null) {
        this.audit.skip();
        return { closure: await this.viewOf(stored, today), changed: false };
      }
      const problem = closureArchiveProblem(stored, today);
      if (problem !== null) throw new ProblemException(problem, 422);
      const row = await this.repository.archive(tx, stored.id, now);
      await this.site.touch(tx, ['home', `branch:${branch_code}`]);
      this.effects.collect(row.branch_id, [row]);
      await this.audit.emit({
        action: WEBSITE_CLOSURE_ARCHIVE,
        entity_type: 'branch_closures',
        entity_id: row.id,
        branch_id: row.branch_id,
        before: { archived_at: null },
        after: { archived_at: toMmtIsoMillis(now) },
        reason: reason === '' ? null : reason,
      });
      return { closure: await this.viewOf(row, today), changed: true };
    });
    if (done.changed) this.effects.committed(done.closure.branch_id);
    return done.closure;
  }

  private actor(): string {
    const actor = RequestContext.current()?.user_id;
    if (actor === undefined) throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
    return actor;
  }

  private async viewOf(row: ClosureRow, today: string): Promise<BranchClosure> {
    const [closure] = await this.views.of([row], today);
    if (closure === undefined) throw new Error('ClosureWrites: the view lost the closure');
    return closure;
  }

  /** The closure with the bookings inside its dates (the new range after an edit). */
  private async resultOf(row: ClosureRow, today: string): Promise<ClosureResult> {
    const { affected_bookings, warnings } = await this.affected.of(
      row.branch_id,
      row.start_date,
      row.end_date,
    );
    return { closure: await this.viewOf(row, today), affected_bookings, warnings };
  }

  /**
   * A race the pre-check missed: the exclusion constraint refused the write and the transaction is
   * gone, so the other closure's id is read outside it.
   */
  private async raceOverlap(
    range: { branch_id: string; start_date: string; end_date: string },
    exceptId?: string,
  ): Promise<ProblemException> {
    return overlap(
      await this.repository.overlapping(
        range.branch_id,
        range.start_date,
        range.end_date,
        exceptId,
      ),
    );
  }
}

/** The members of a closure the body changes; `now` is the clock for `updated_at`. */
function changeOf(
  stored: ClosureRow,
  merged: { start_date: string; end_date: string },
  body: ClosureUpdateBody,
  now: Date,
): ClosureChange {
  const noticeEn = storedNotice(body.notice_en);
  return {
    ...(merged.start_date === stored.start_date ? {} : { start_date: merged.start_date }),
    ...(merged.end_date === stored.end_date ? {} : { end_date: merged.end_date }),
    ...(body.notice_mm === undefined || body.notice_mm === stored.notice_mm
      ? {}
      : { notice_mm: body.notice_mm }),
    ...(body.notice_en === undefined || noticeEn === stored.notice_en
      ? {}
      : { notice_en: noticeEn }),
    now,
  };
}

const CHANGE_MEMBERS = ['start_date', 'end_date', 'notice_mm', 'notice_en'] as const;
type ChangeMember = (typeof CHANGE_MEMBERS)[number];
const isChangedMember = (key: string): key is ChangeMember =>
  CHANGE_MEMBERS.some((member) => member === key);

/** The changed members of a closure row, the audit row's before / after (API-AUD-01). */
function auditMembers(row: ClosureRow, members: readonly ChangeMember[]): Record<string, unknown> {
  return Object.fromEntries(members.map((member) => [member, row[member]]));
}

/** 409 `closure_overlap` naming the closure in the way (`context.closure_id`). */
function overlap(closureId: string | null): ProblemException {
  return new ProblemException(ErrorCode.CLOSURE_OVERLAP, 409, {
    ...(closureId === null ? {} : { context: { closure_id: closureId } }),
  });
}
