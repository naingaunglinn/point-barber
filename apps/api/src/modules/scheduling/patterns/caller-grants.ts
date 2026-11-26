import type { GrantSet } from '../../../common/access/grant-set.js';
import { RequestContext } from '../../../common/http/request-context.js';

/** The caller's grants, which the access guard built for this route's declaration (design D11). */
export function callerGrants(): GrantSet {
  const grants = RequestContext.current()?.grants;
  if (grants === undefined) throw new Error('schedule: the access guard built no grant set');
  return grants;
}
