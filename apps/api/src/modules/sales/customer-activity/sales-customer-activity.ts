import { Injectable } from '@nestjs/common';
import { type Mmk, subtractMoney } from '@point/shared';

import type { ReadScope } from '../../../common/access/read-scope.js';
import type { SqlPiece, Tx } from '../../../common/database/transaction-runner.js';
import type { CustomerActivity, CustomerTotals, RecentVisit } from '../../booking/index.js';
import { VisitsRegistry } from '../ports/visits-registry.js';
import { CustomerActivityRepository } from '../repositories/customer-activity.repository.js';

// The port `CustomerActivity` of booking, implemented by sales (add-walkin-visit-checkout design D1;
// add-customer-management design D1 / D3 / D6): one definition of a finished visit — a FINISHED sale
// of the customer that has a visit (a product-only sale is not a visit), at a branch in the caller's
// read scope — behind P3.CUS.02's `last_visit_at`, the list, the statistics and the preferred barber.
@Injectable()
export class SalesCustomerActivity implements CustomerActivity {
  constructor(
    private readonly repository: CustomerActivityRepository,
    private readonly registry: VisitsRegistry,
  ) {}

  async lastVisitAt(db: Tx, customerId: string, scope: ReadScope): Promise<Date | null> {
    return (await this.repository.visitsOf(db, customerId, scope))?.last_visit_at ?? null;
  }

  visitAggregate(scope: ReadScope): SqlPiece {
    return this.repository.visitAggregate(scope);
  }

  /** Total spent = Σ FINISHED sales − Σ their SALE_REFUNDs; an OVERPAYMENT_RETURN is change (D6). */
  async totals(db: Tx, customerId: string, scope: ReadScope): Promise<CustomerTotals> {
    const row = await this.repository.totals(db, customerId, scope);
    return {
      visit_count: row.visit_count,
      total_spent_amount: subtractMoney(row.sales_total as Mmk, row.refunded_total as Mmk),
      last_visit_at: row.last_visit_at,
    };
  }

  /** The last `window` finished visits; the performer is the visit's, read from delivery (D1). */
  async recentVisits(
    db: Tx,
    customerId: string,
    scope: ReadScope,
    window: number,
  ): Promise<readonly RecentVisit[]> {
    const sales = await this.repository.recentVisitSales(db, customerId, scope, window);
    const visits = await this.registry.visits.readMany(
      db,
      sales.map((sale) => sale.visit_id),
    );
    const performers = new Map(visits.map((visit) => [visit.id, visit.performed_by_employee_id]));
    return sales.flatMap((sale) => {
      const performer = performers.get(sale.visit_id);
      return performer === undefined
        ? []
        : [
            {
              visit_id: sale.visit_id,
              finished_at: sale.finished_at,
              performed_by_employee_id: performer,
            },
          ];
    });
  }
}
