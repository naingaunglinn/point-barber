import { Injectable } from '@nestjs/common';
import {
  type CancelReason,
  type CancelReasonCreate,
  CancelReasonStatus,
  ErrorCode,
} from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { CurrentCompany } from '../../people/index.js';
import { Audit } from '../../platform/index.js';
import { CancelReasonsRepository } from '../repositories/cancel-reasons.repository.js';
import { toCancelReason } from './cancel-reason-reads.js';

// P3.CRS.02 – 05 — the company-master writes of the cancel-reason list (add-booking-cancel-reasons
// design D1 · D4 · D6 · D8). Each runs inside the caller's TransactionRunner.run; the audit rows carry
// no branch (P3-RULE-13 · API-AUD-01).

export const CANCEL_REASON_CREATE = 'booking_cancel_reason.create';
const ENTITY = 'booking_cancel_reasons';

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
}
