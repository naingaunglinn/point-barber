import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { CatalogRepository } from '../repositories/catalog.repository.js';

// Eligibility is per employee × branch × service, effective-dated (P2-RULE-06 · D-EMP-05). A walk-in
// line for a service the barber is not eligible for is recorded anyway with the warning `not_eligible`
// (add-walkin-visit-checkout design D1); this is the lookup behind that warning.
@Injectable()
export class Eligibility {
  constructor(private readonly repository: CatalogRepository) {}

  isEligible(
    db: Tx,
    key: { employee_id: string; branch_id: string; service_id: string; date: string },
  ): Promise<boolean> {
    return this.repository.hasEligibility(db, key);
  }
}
