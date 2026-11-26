import { ProxyReason } from '@point/shared';

import type { PeopleDirectory } from '../../people/index.js';
import type { VisitForSale } from '../ports/visits-port.js';

// The collector of a payment sent without `collected_by_employee_id` (P4-RULE-09 · D-VIS-06 / 12 ·
// add-proxy-recording design D5): on a visit with `proxy_reason` 1 PHONE_UNAVAILABLE the recorder's
// employee (the employee of `started_by_user_id` — he holds the cash and closes the sale), on every
// other visit the performer. The one helper `add-payment-collector-picker` (#22) shares for its list.
export async function defaultCollectorOf(
  people: Pick<PeopleDirectory, 'employeeOfUser'>,
  visit: Pick<VisitForSale, 'proxy_reason' | 'started_by_user_id' | 'performed_by_employee_id'>,
): Promise<string> {
  if (visit.proxy_reason !== ProxyReason.PHONE_UNAVAILABLE)
    return visit.performed_by_employee_id;
  const recorder = await people.employeeOfUser(visit.started_by_user_id);
  // Every staff user has one employee (D-AUTH-07); a reason-1 START checked his assignment.
  if (recorder === null) throw new Error(`user ${visit.started_by_user_id} has no employee`);
  return recorder.id;
}
