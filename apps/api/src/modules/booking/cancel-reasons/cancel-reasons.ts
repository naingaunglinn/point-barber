import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { isUuid } from '../../../common/http/uuid-v7.js';
import { CurrentCompany } from '../../people/index.js';
import {
  type CancelReasonRef,
  CancelReasonsRepository,
} from '../repositories/cancel-reasons.repository.js';

export type { CancelReasonRef } from '../repositories/cancel-reasons.repository.js';

/**
 * The public read surface of the cancel reasons (add-booking-cancel-reasons design D1): the cancel
 * dialog's reason check (#38), the manage page (#64) and the no-show timer (#39) read through it.
 */
@Injectable()
export class CancelReasons {
  constructor(
    private readonly repository: CancelReasonsRepository,
    private readonly company: CurrentCompany,
  ) {}

  /** The company's reason with this id — an archived one too, with its `archived_at`; null if none. */
  async find(db: Tx, id: string): Promise<CancelReasonRef | null> {
    if (!isUuid(id)) return null;
    return this.repository.findRef(db, await this.company.id(db), id);
  }

  /** The no-show reason (`system_code` 1 — D-BKG-17), which the base seed always adds. */
  async noShow(db: Tx): Promise<CancelReasonRef> {
    const row = await this.repository.findNoShow(db, await this.company.id(db));
    if (row === null)
      throw new Error('cancel reasons: no system_code 1 row — the base seed adds it');
    return row;
  }
}
