import { Injectable } from '@nestjs/common';
import {
  type CancelReason,
  type CancelReasonListQuery,
  type CancelReasonStatus,
  type CancelReasonSystemCode,
  toMmtIsoMillis,
} from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { CurrentCompany } from '../../people/index.js';
import {
  type CancelReasonRow,
  CancelReasonsRepository,
} from '../repositories/cancel-reasons.repository.js';

// P3.CRS.01 — the operational list of the cancel dialog and the management list of Settings › Cancel
// reasons (add-booking-cancel-reasons design D1 · D7). The access check of `include_archived` is the
// controller's (design D2); this reads what it is asked.

/** The `CancelReason` answer (Part 3 §11): instants to the millisecond, as `expected_updated_at`. */
export function toCancelReason(row: CancelReasonRow): CancelReason {
  return {
    id: row.id,
    name_mm: row.name_mm,
    name_en: row.name_en,
    requires_note: row.requires_note,
    system_code: row.system_code as CancelReasonSystemCode | null,
    sort_order: row.sort_order,
    status: row.status as CancelReasonStatus,
    archived_at: row.archived_at === null ? null : toMmtIsoMillis(row.archived_at),
    updated_at: toMmtIsoMillis(row.updated_at),
  };
}

@Injectable()
export class CancelReasonReads {
  constructor(
    private readonly repository: CancelReasonsRepository,
    private readonly company: CurrentCompany,
  ) {}

  async list(db: Tx, query: CancelReasonListQuery): Promise<CancelReason[]> {
    const rows = await this.repository.list(db, await this.company.id(db), {
      status: query.status,
      includeArchived: query.include_archived,
    });
    return rows.map(toCancelReason);
  }
}
