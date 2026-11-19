import { Injectable } from '@nestjs/common';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { CurrentCompany } from '../../people/index.js';
import { Audit } from '../../platform/index.js';
import { CancelReasonsRepository } from '../repositories/cancel-reasons.repository.js';
import { planCancelReasonSeed } from './cancel-reason-presets.js';

// The base-seed step `cancel reasons` (order 40 — after people's base seed 20, which creates the company
// row, and the payment methods 30), every environment: the no-show timer needs the system row in
// production too (add-booking-cancel-reasons design D3 · proposal reading 7 · D-BKG-17).

@Injectable()
export class CancelReasonSeed {
  constructor(
    private readonly repository: CancelReasonsRepository,
    private readonly company: CurrentCompany,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  /** Inserts what the planner returns; one `booking_cancel_reason.create` system row each. */
  async ensure(tx: Tx): Promise<void> {
    const companyId = await this.company.id(tx);
    const rows = planCancelReasonSeed(await this.repository.seedState(tx, companyId));
    const now = this.clock.now();
    for (const preset of rows) {
      const id = uuidV7(now.getTime());
      await this.repository.insert(tx, { id, company_id: companyId, ...preset }, now);
      // A company master row: no branch (P3-RULE-13 · API-AUD-01).
      this.audit.emitSystem({
        action: 'booking_cancel_reason.create',
        entity_type: 'booking_cancel_reasons',
        entity_id: id,
        after: { ...preset },
      });
    }
  }
}
