import type { Tx } from '../../../common/database/transaction-runner.js';

// The port `VisitsPort` (add-walkin-visit-checkout design D1): FINISH lives in `sales` and must lock
// and finish the visit, and a line needs the visit's performer and date; `delivery` owns visits and
// imports `sales`. So `sales` declares this port and `delivery` implements and registers it — the
// same pattern as booking's CustomerActivity — and there is no import cycle.

export interface VisitForSale {
  readonly id: string;
  readonly branch_id: string;
  readonly status: number;
  readonly performed_by_employee_id: string;
  readonly started_by_user_id: string;
  /** The Myanmar calendar date of the visit (D-PLT-15). */
  readonly business_date: string;
  readonly location_type: number;
}

export interface VisitsPort {
  read(db: Tx, visitId: string): Promise<VisitForSale | null>;
  lockForUpdate(tx: Tx, visitId: string): Promise<VisitForSale>;
  markFinished(tx: Tx, visitId: string, finishedAt: Date): Promise<void>;
}
