import { Injectable } from '@nestjs/common';
import { CancelReasonSystemCode } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import type {
  CancelReasonPreset,
  CancelReasonSeedState,
} from '../cancel-reasons/cancel-reason-presets.js';

// Table `booking_cancel_reasons` (DB Part 3 v3 — F-BK-17), written only by `booking` (ADR-001 rule 1 ·
// add-booking-cancel-reasons design D1). This part holds what the base seed needs; the P3.CRS reads
// and writes join it with their routes.

@Injectable()
export class CancelReasonsRepository {
  /** What the seed planner reads (design D3) — counted in SQL, so no row list and no bound to reach. */
  async seedState(tx: Tx, companyId: string): Promise<CancelReasonSeedState> {
    const reasons = tx.booking_cancel_reasons;
    const company = { company_id: companyId };
    const rows = await reasons.count({ where: company });
    const noShow = { ...company, system_code: CancelReasonSystemCode.NO_SHOW };
    const { _max: max } = await reasons.aggregate({
      where: { ...company, archived_at: null },
      _max: { sort_order: true },
    });
    return {
      rows,
      hasNoShow: (await reasons.count({ where: noShow })) > 0,
      lastSortOrder: max.sort_order ?? 0,
    };
  }

  async insert(
    tx: Tx,
    row: CancelReasonPreset & { readonly id: string; readonly company_id: string },
    at: Date,
  ): Promise<void> {
    await tx.booking_cancel_reasons.create({ data: { ...row, created_at: at, updated_at: at } });
  }
}
