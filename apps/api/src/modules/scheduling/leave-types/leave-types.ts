import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type LeaveType,
  type LeaveTypeCreateBody,
  type LeaveTypeUpdateBody,
  type LeaveTypesQuery,
  toMmtIso,
} from '@point/shared';

import { decide } from '../../../common/access/decide.js';
import type { GrantSet } from '../../../common/access/grant-set.js';
import { Clock } from '../../../common/clock/clock.js';
import { type Tx, TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { isUuid, uuidV7 } from '../../../common/http/uuid-v7.js';
import { CurrentCompany } from '../../people/index.js';
import { Audit } from '../../platform/index.js';
import {
  type LeaveTypeWrite,
  LeaveTypesRepository,
} from '../repositories/leave-types.repository.js';
import { activeOrNull, changedMembers, sameMillisecond, zawgyiFields } from './leave-type-rules.js';
import { type LeaveTypeRow, toLeaveType } from './leave-type-mapper.js';

// The leave-type endpoints of add-leave-types (P2.LVT.01 – 04 · design D1 / D2 / D5). One
// TransactionRunner.run per write (READ COMMITTED); the type row is the only row lock, taken first,
// and every check runs after it (CG-API-07 · CG-DB-06). Each committed write leaves one audit row with
// branch_id NULL — a company master (P2-RULE-12 · API-AUD-01 · design D7).

export const LEAVE_TYPE_CREATE = 'leave_type.create';
export const LEAVE_TYPE_UPDATE = 'leave_type.update';
export const LEAVE_TYPE_ARCHIVE = 'leave_type.archive';

const ENTITY = 'leave_types';
const notFound = () => new ProblemException(ErrorCode.NOT_FOUND, 404);

/** 400 zawgyi_text with one `errors[]` item per name typed in Zawgyi (API-SHAPE-05 · design D4). */
function assertNoZawgyi(members: LeaveTypeWrite): void {
  const errors = zawgyiFields(members);
  if (errors.length > 0) throw new ProblemException(ErrorCode.ZAWGYI_TEXT, 400, { errors });
}

/** The stored members — the `after_data` of a create (design D7). */
const storedMembers = (row: LeaveTypeRow) => ({
  name_mm: row.name_mm,
  name_en: row.name_en,
  is_paid: row.is_paid,
  sort_order: row.sort_order,
  status: row.status,
});

@Injectable()
export class LeaveTypes {
  constructor(
    private readonly repository: LeaveTypesRepository,
    private readonly runner: TransactionRunner,
    private readonly audit: Audit,
    private readonly company: CurrentCompany,
    private readonly clock: Clock,
  ) {}

  /**
   * P2.LVT.01 — any signed-in staff member; `include_archived=true` first needs any `leave_type.*`
   * code — the guard's own decide() (design D2), before any read.
   */
  async list(query: LeaveTypesQuery, grants: GrantSet): Promise<{ items: LeaveType[] }> {
    if (query.include_archived) {
      const decision = decide(
        { kind: 'canView', module: 'leave_type' },
        grants,
        { kind: 'none' },
        'GET',
      );
      if (!decision.allow) {
        throw new ProblemException(decision.code, decision.status, {
          ...(decision.required === undefined ? {} : { context: { required: decision.required } }),
        });
      }
    }
    const rows = await this.repository.list(await this.company.id(), {
      statuses: query.status,
      includeArchived: query.include_archived,
    });
    return { items: rows.map(toLeaveType) };
  }

  /** P2.LVT.02 — a new ACTIVE type, placed last without `sort_order` (LT1 · design D5). */
  create(body: LeaveTypeCreateBody): Promise<LeaveType> {
    return this.runner.run(async (tx) => {
      assertNoZawgyi(body);
      const now = this.clock.now();
      const companyId = await this.company.id(tx);
      const row = await this.repository.insert(tx, {
        id: uuidV7(now.getTime()),
        company_id: companyId,
        name_mm: body.name_mm,
        name_en: body.name_en ?? null,
        is_paid: body.is_paid,
        sort_order: body.sort_order ?? (await this.repository.nextSortOrder(tx, companyId)),
        at: now,
      });
      await this.audit.emit({
        action: LEAVE_TYPE_CREATE,
        entity_type: ENTITY,
        entity_id: row.id,
        branch_id: null,
        before: null,
        after: storedMembers(row),
      });
      return toLeaveType(row);
    });
  }

  /** P2.LVT.03 — only the members sent; stale → 409, unchanged → 200 with no write (D6 · D7). */
  update(id: string, body: LeaveTypeUpdateBody): Promise<LeaveType> {
    return this.runner.run(async (tx) => {
      const stored = await this.lock(tx, id);
      // An archived type is not edited: 404, as for an unknown id (Recorded reading 5).
      if (stored.archived_at !== null) throw notFound();
      if (!sameMillisecond(stored.updated_at, body.expected_updated_at)) {
        throw new ProblemException(ErrorCode.CONFLICT, 409);
      }
      const { expected_updated_at: _expected, ...members } = body;
      assertNoZawgyi(members);
      const { before, after } = changedMembers(stored, members);
      if (Object.keys(after).length === 0) {
        this.audit.skip();
        return toLeaveType(stored);
      }
      // A Myanmar name another non-archived type holds: leave_types_name_active → 409 already_exists.
      const row = await this.repository.updateMembers(tx, id, members, this.clock.now());
      await this.audit.emit({
        action: LEAVE_TYPE_UPDATE,
        entity_type: ENTITY,
        entity_id: id,
        branch_id: null,
        before,
        after,
      });
      return toLeaveType(row);
    });
  }

  /** P2.LVT.04 — refused while a PENDING leave uses the type; a repeat answers 200 unchanged. */
  archive(id: string): Promise<LeaveType> {
    return this.runner.run(async (tx) => {
      const stored = await this.lock(tx, id);
      if (stored.archived_at !== null) {
        this.audit.skip();
        return toLeaveType(stored);
      }
      if (await this.repository.pendingLeaveExists(tx, id)) {
        throw new ProblemException(ErrorCode.LEAVE_TYPE_IN_USE, 409);
      }
      const now = this.clock.now();
      const row = await this.repository.setArchived(tx, id, now);
      await this.audit.emit({
        action: LEAVE_TYPE_ARCHIVE,
        entity_type: ENTITY,
        entity_id: id,
        branch_id: null,
        before: { archived_at: null },
        after: { archived_at: toMmtIso(now) },
      });
      return toLeaveType(row);
    });
  }

  /**
   * For add-leave-requests (#32 — design D1 / D5): inside the caller's transaction, the type locked FOR
   * SHARE until commit when it is ACTIVE and not archived, else null. A new PENDING leave and an archive
   * then serialise on the type row: the archive's FOR UPDATE waits for the leave's commit and sees it.
   */
  async lockActive(tx: Tx, id: string): Promise<LeaveTypeRow | null> {
    if (!isUuid(id)) return null;
    return activeOrNull(await this.repository.lockShared(tx, await this.company.id(tx), id));
  }

  /** The type row locked first (design D5); 404 for an id that is no leave type of the company. */
  private async lock(tx: Tx, id: string): Promise<LeaveTypeRow> {
    const row = isUuid(id)
      ? await this.repository.lockById(tx, await this.company.id(tx), id)
      : null;
    if (row === null) throw notFound();
    return row;
  }
}
