import { Injectable } from '@nestjs/common';
import {
  type CancelReason,
  type CancelReasonCreate,
  type CancelReasonOrder,
  CancelReasonStatus,
  type CancelReasonUpdate,
  ErrorCode,
  type FieldError,
  isZawgyi,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { isUuid, uuidV7 } from '../../../common/http/uuid-v7.js';
import { CurrentCompany } from '../../people/index.js';
import { Audit } from '../../platform/index.js';
import {
  type CancelReasonRow,
  CancelReasonsRepository,
} from '../repositories/cancel-reasons.repository.js';
import { toCancelReason } from './cancel-reason-reads.js';

// P3.CRS.02 – 05 — the company-master writes of the cancel-reason list (add-booking-cancel-reasons
// design D1 · D4 · D6 · D8). Each runs inside the caller's TransactionRunner.run; the audit rows carry
// no branch (P3-RULE-13 · API-AUD-01).

export const CANCEL_REASON_CREATE = 'booking_cancel_reason.create';
export const CANCEL_REASON_UPDATE = 'booking_cancel_reason.update';
export const CANCEL_REASON_ARCHIVE = 'booking_cancel_reason.archive';
export const CANCEL_REASON_REORDER = 'booking_cancel_reason.reorder';
const ENTITY = 'booking_cancel_reasons';

/** The members a PATCH may change (P3.CRS.03); the system row keeps the last two (design D5). */
const EDITABLE = ['name_mm', 'name_en', 'requires_note', 'status'] as const;
type Editable = (typeof EDITABLE)[number];
const SYSTEM_KEEPS: readonly Editable[] = ['requires_note', 'status'];

/** The members sent with a value other than the stored one, in EDITABLE order. */
function changedMembers(stored: CancelReasonRow, sent: CancelReasonUpdate): Editable[] {
  return EDITABLE.filter((member) => sent[member] !== undefined && sent[member] !== stored[member]);
}

const notFound = () => new ProblemException(ErrorCode.NOT_FOUND, 404);

/**
 * Zawgyi text in a name is refused, one `errors[]` item per member (API-SHAPE-05 · AD-FORM-13 — the
 * check branch and company apply; recorded reading of A2), before any lookup or write.
 */
export function assertNoZawgyi(names: {
  readonly name_mm?: string;
  readonly name_en?: string | null;
}): void {
  const errors: FieldError[] = (['name_mm', 'name_en'] as const)
    .filter((member) => {
      const text = names[member];
      return typeof text === 'string' && isZawgyi(text);
    })
    .map((field) => ({ field, code: ErrorCode.ZAWGYI_TEXT }));
  if (errors.length > 0) throw new ProblemException(ErrorCode.ZAWGYI_TEXT, 400, { errors });
}

@Injectable()
export class CancelReasonWrites {
  constructor(
    private readonly repository: CancelReasonsRepository,
    private readonly company: CurrentCompany,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  /**
   * P3.CRS.02 — an ACTIVE admin row, never a system row (design D4 · D5): the trimmed name checked
   * first (409 `already_exists`; the index `booking_cancel_reasons_name_active` decides a race), placed
   * last unless a `sort_order` is sent (owner CR1).
   */
  async create(tx: Tx, body: CancelReasonCreate): Promise<CancelReason> {
    assertNoZawgyi(body);
    const companyId = await this.company.id(tx);
    if (await this.repository.nameTaken(tx, companyId, body.name_mm)) {
      throw new ProblemException(ErrorCode.ALREADY_EXISTS, 409);
    }
    const now = this.clock.now();
    const row = await this.repository.create(
      tx,
      {
        id: uuidV7(now.getTime()),
        company_id: companyId,
        name_mm: body.name_mm,
        name_en: body.name_en ?? null,
        requires_note: body.requires_note,
        system_code: null,
        sort_order: body.sort_order ?? (await this.repository.nextSortOrder(tx, companyId)),
        status: CancelReasonStatus.ACTIVE,
      },
      now,
    );
    const { id: _id, updated_at: _updated, archived_at: _archived, ...after } = row;
    await this.audit.emit({
      action: CANCEL_REASON_CREATE,
      entity_type: ENTITY,
      entity_id: row.id,
      branch_id: null,
      before: null,
      after,
    });
    return toCancelReason(row);
  }

  /**
   * P3.CRS.03 — the row under its lock: unknown or archived → 404, a stale `expected_updated_at` → 409
   * `conflict` (to the millisecond — API-IDEM-04), the system row's status or note flag → 409
   * `system_row`, a name taken → 409 `already_exists`, then only the changed members, or nothing and no
   * audit row (design D4 · D5 · D8).
   */
  async update(tx: Tx, id: string, body: CancelReasonUpdate): Promise<CancelReason> {
    assertNoZawgyi(body);
    const companyId = await this.company.id(tx);
    const stored = isUuid(id) ? await this.repository.lockById(tx, companyId, id) : null;
    if (stored === null || stored.archived_at !== null) throw notFound();
    if (stored.updated_at.getTime() !== new Date(body.expected_updated_at).getTime()) {
      throw new ProblemException(ErrorCode.CONFLICT, 409);
    }
    const changes = changedMembers(stored, body);
    if (stored.system_code !== null && changes.some((member) => SYSTEM_KEEPS.includes(member))) {
      throw new ProblemException(ErrorCode.SYSTEM_ROW, 409);
    }
    if (
      body.name_mm !== undefined &&
      changes.includes('name_mm') &&
      (await this.repository.nameTaken(tx, companyId, body.name_mm, id))
    ) {
      throw new ProblemException(ErrorCode.ALREADY_EXISTS, 409);
    }
    if (changes.length === 0) {
      this.audit.skip();
      return toCancelReason(stored);
    }
    const members = Object.fromEntries(changes.map((member) => [member, body[member]]));
    const row = await this.repository.update(tx, id, members, this.clock.now());
    await this.audit.emit({
      action: CANCEL_REASON_UPDATE,
      entity_type: ENTITY,
      entity_id: id,
      branch_id: null,
      before: Object.fromEntries(changes.map((member) => [member, stored[member]])),
      after: members,
    });
    return toCancelReason(row);
  }

  /**
   * P3.CRS.04 — unknown → 404, the system row → 409 `system_row`, an archived row → 200 unchanged and no
   * audit row; otherwise `archived_at` = now, status kept (design D4 · D5 · D8). Never deleted.
   */
  async archive(tx: Tx, id: string): Promise<CancelReason> {
    const companyId = await this.company.id(tx);
    const stored = isUuid(id) ? await this.repository.lockById(tx, companyId, id) : null;
    if (stored === null) throw notFound();
    if (stored.system_code !== null) throw new ProblemException(ErrorCode.SYSTEM_ROW, 409);
    if (stored.archived_at !== null) {
      this.audit.skip();
      return toCancelReason(stored);
    }
    const now = this.clock.now();
    const row = await this.repository.update(tx, id, { archived_at: now }, now);
    await this.audit.emit({
      action: CANCEL_REASON_ARCHIVE,
      entity_type: ENTITY,
      entity_id: id,
      branch_id: null,
      before: { archived_at: null },
      after: { archived_at: now },
    });
    return toCancelReason(row);
  }

  /**
   * P3.CRS.05 — `ids` must be every non-archived reason exactly once (else 400 `validation` on `ids`,
   * nothing written); then `sort_order` = 1 … n, and an order already stored writes nothing (design D4 ·
   * D6 · D8).
   */
  async reorder(tx: Tx, body: CancelReasonOrder): Promise<CancelReason[]> {
    const companyId = await this.company.id(tx);
    const locked = await this.repository.lockActive(tx, companyId);
    const byId = new Map(locked.map((row) => [row.id, row]));
    const rows = body.ids.map((id) => byId.get(id));
    const complete =
      new Set(body.ids).size === body.ids.length && body.ids.length === locked.length;
    if (!complete || rows.some((row) => row === undefined)) {
      throw new ProblemException(ErrorCode.VALIDATION, 400, {
        errors: [{ field: 'ids', code: 'invalid_value' }],
      });
    }
    const ordered = rows.filter((row): row is CancelReasonRow => row !== undefined);
    const moved = ordered.filter((row, index) => row.sort_order !== index + 1);
    if (moved.length === 0) {
      this.audit.skip();
      return ordered.map(toCancelReason);
    }
    const now = this.clock.now();
    const items: CancelReason[] = [];
    for (const [index, row] of ordered.entries()) {
      items.push(
        toCancelReason(
          row.sort_order === index + 1
            ? row
            : await this.repository.update(tx, row.id, { sort_order: index + 1 }, now),
        ),
      );
    }
    await this.audit.emit({
      action: CANCEL_REASON_REORDER,
      entity_type: ENTITY,
      entity_id: null,
      branch_id: null,
      before: { ids: locked.map((row) => row.id) },
      after: { ids: body.ids },
    });
    return items;
  }
}
