import { ErrorCode } from '@point/shared';

import { RequestContext } from '../http/request-context.js';
import { ProblemException } from '../http/problem.exception.js';
import { decide } from './decide.js';
import type { AccessModule } from './declarations.js';
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

  /**
   * The conditional management check of a `@Staff()` read (add-service-catalogue design D2 · P2-RULE-11 ·
   * API-PERM-06): only whether `<module>.view⁺` is needed depends on the query, so the handler asks the
   * guard's own decision for a `@CanView(module)` route. The branches any code of the module reaches,
   * or null for a caller who holds none — the answer a hidden row (404) needs.
   */
  viewScope(module: AccessModule): Scope | null {
    const grants = RequestContext.current()?.grants;
    if (grants === undefined) throw new Error('AccessContext.viewScope: the guard set no grants');
    const decision = decide({ kind: 'canView', module }, grants, { kind: 'none' }, 'GET');
    return decision.allow ? grants.branchesOfModule(module) : null;
  },

  /** `viewScope`, refused as `@CanView(module)` refuses: 403 `forbidden`, `context.required` = `<module>.view`. */
  requireViewScope(module: AccessModule): Scope {
    const scope = AccessContext.viewScope(module);
    if (scope === null) {
      throw new ProblemException(ErrorCode.FORBIDDEN, 403, {
        context: { required: `${module}.view` },
      });
    }
    return scope;
  },
};
