import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import type {
  CancelReasonPreset,
  ExistingCancelReason,
} from '../cancel-reasons/cancel-reason-presets.js';

// Table `booking_cancel_reasons` (DB Part 3 v3 — F-BK-17), written only by `booking` (ADR-001 rule 1 ·
// add-booking-cancel-reasons design D1). This part holds what the base seed needs; the P3.CRS reads
// and writes join it with their routes.

@Injectable()
export class CancelReasonsRepository {
  /** What the seed planner reads of every row of the company, archived rows included (design D3). */
  seedState(tx: Tx, companyId: string): Promise<ExistingCancelReason[]> {
    return tx.booking_cancel_reasons.findMany({
      where: { company_id: companyId },
      select: { system_code: true, sort_order: true, archived_at: true },
    });
  }

  async insert(
    tx: Tx,
    row: CancelReasonPreset & { readonly id: string; readonly company_id: string },
    at: Date,
  ): Promise<void> {
    await tx.booking_cancel_reasons.create({ data: { ...row, created_at: at, updated_at: at } });
  }
}
