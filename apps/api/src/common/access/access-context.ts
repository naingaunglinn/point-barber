import { RequestContext } from '../http/request-context.js';
import type { Scope } from './grant-set.js';

// What the access guard hands to the handler (design D11): the scope a `@Staff()` read or a
// `@CanView(module)` list must filter by. Lists never answer 403 to a holder; a `branch_id` filter
// outside the scope is an empty page, answered without a query.
export const AccessContext = {
  /** The scope of the current request; throws when the route's declaration sets none. */
  scope(): Scope {
    const scope = RequestContext.current()?.access_scope;
    if (scope === undefined) throw new Error('AccessContext.scope: the route declares no scope');
    return scope;
  },
};
