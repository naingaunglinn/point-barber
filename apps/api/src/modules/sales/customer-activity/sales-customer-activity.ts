import { Injectable } from '@nestjs/common';

import type { ReadScope } from '../../../common/access/read-scope.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import type { CustomerActivity } from '../../booking/index.js';
import { SalesRepository } from '../repositories/sales.repository.js';

// The port `CustomerActivity` of booking, implemented by sales (add-walkin-visit-checkout design D1):
// P3.CUS.02's `last_visit_at` = the finish time of the customer's latest FINISHED visit at a branch
// in the caller's read scope — a FINISHED sale with a visit (a product-only sale is not a visit).
@Injectable()
export class SalesCustomerActivity implements CustomerActivity {
  constructor(private readonly sales: SalesRepository) {}

  lastVisitAt(
    db: Tx,
    customerId: string,
    branchIds: 'all' | readonly string[],
  ): Promise<Date | null> {
    return this.sales.lastVisitFinishedAt(db, customerId, branchIds === 'all' ? null : branchIds);
  }
}
