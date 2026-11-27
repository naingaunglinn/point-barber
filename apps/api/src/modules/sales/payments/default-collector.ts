import { ErrorCode } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import type { VisitForSale } from '../ports/visits-port.js';
import type { SaleRow } from '../repositories/sales.repository.js';

// The default collector of a sale (requirement `"Collected by" defaults to the performer` · D-VIS-06 ·
// add-payment-collector-picker design D1 step 7): one helper for `Payments.create` and the collector
// list, so the payment and the list's `is_default` never differ. It is async because the reason-1
// recorder of `add-proxy-recording` (#19) needs a read. On `main` every sale belongs to a visit, so the
// default is the performer; the product-only sale (#57) and the difference sale (#27) add their
// branches when they land (P4-RULE-12).
export async function defaultCollectorOf(
  _db: Tx,
  of: { readonly sale: SaleRow; readonly visit: VisitForSale | null },
): Promise<string> {
  if (of.visit === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
  return of.visit.performed_by_employee_id;
}
