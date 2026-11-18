import { Injectable } from '@nestjs/common';
import { type Mmk, SaleStatus, type VisitStatus, subtractMoney } from '@point/shared';

import type { ReadScope } from '../../../common/access/read-scope.js';
import type { SqlPiece, Tx } from '../../../common/database/transaction-runner.js';
import type {
  ActivityEntry,
  CustomerActivity,
  CustomerTotals,
  RecentVisit,
} from '../../booking/index.js';
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

  /**
   * A visit entry for every visit of the customer's sales — receipt and amount once the sale is
   * FINISHED — and a sale entry for every FINISHED sale without a visit (design D10).
   */
  async timelineEntries(
    db: Tx,
    customerId: string,
    scope: ReadScope,
  ): Promise<readonly ActivityEntry[]> {
    const sales = await this.repository.timelineSales(db, customerId, scope);
    const visitIds = sales.flatMap((sale) => (sale.visit_id === null ? [] : [sale.visit_id]));
    const visits = new Map(
      (await this.registry.visits.readMany(db, visitIds)).map((visit) => [visit.id, visit]),
    );
    return sales.flatMap((sale): ActivityEntry[] => {
      const finished = sale.status === SaleStatus.FINISHED;
      const total = sale.total_amount as Mmk;
      if (sale.visit_id === null) {
        return finished && sale.finished_at !== null && sale.receipt_number !== null
          ? [
              {
                type: 'sale',
                id: sale.id,
                at: sale.finished_at,
                branch_id: sale.branch_id,
                status: SaleStatus.FINISHED,
                receipt_number: sale.receipt_number,
                total_amount: total,
              },
            ]
          : [];
      }
      const visit = visits.get(sale.visit_id);
      return visit === undefined
        ? []
        : [
            {
              type: 'visit',
              id: visit.id,
              at: visit.started_at,
              branch_id: visit.branch_id,
              status: visit.status as VisitStatus,
              employee_id: visit.performed_by_employee_id,
              receipt_number: finished ? sale.receipt_number : null,
              total_amount: finished ? total : null,
            },
          ];
    });
  }
}
