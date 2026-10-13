import { ScopeType } from '../constants/status.js';
import type { Grant } from '../schemas/me.js';
import type { MeGrants } from './grants.js';
import type { PermissionLevel } from './schema.js';

// can() mirrors what the API decides, by the data level of each permission code (AD-PERM-03 ·
// ADR-012 · design D7). It only shapes the UI: the API checks again on every request.
export type Level = PermissionLevel;

/** Options each level accepts — the type refuses a check the level does not have. */
type OptionsFor<L extends Level> = L extends 'branch'
  ? { readonly branchId?: string }
  : L extends 'company'
    ? { readonly level?: 'company' }
    : { readonly branchId?: string; readonly level?: 'company' };

type Catalogue = Readonly<Record<string, { readonly level: Level }>>;

export interface Can<C extends Catalogue> {
  <K extends keyof C & string>(code: K, options?: OptionsFor<C[K]['level']>): boolean;
  (code: 'earnings.view_own'): boolean;
}

function reaches(grant: Grant, branchId: string): boolean {
  return grant.scope_type === ScopeType.COMPANY || grant.branch_ids.includes(branchId);
}

/**
 * `createCan(catalogue)(me)(code, options)`. A code outside the catalogue does not compile
 * (D-ROLE-08). `add-foundation-auth-access` binds the real catalogue of permissions.json.
 */
export function createCan<const C extends Catalogue>(catalogue: C) {
  return (me: MeGrants): Can<C> =>
    ((code: string, options: { branchId?: string; level?: 'company' } = {}): boolean => {
      if (code === 'earnings.view_own') return me.effective.show_own_earnings;
      const level = catalogue[code]?.level;
      if (level === undefined) return false;
      const grants = me.grants.filter((grant) => grant.code === code);
      const company = grants.some((grant) => grant.scope_type === ScopeType.COMPANY);
      switch (level) {
        case 'shared':
          return grants.length > 0;
        case 'private':
          return company;
        case 'company':
          return options.level === 'company' ? company : grants.length > 0;
        case 'branch':
        case 'mixed': {
          if (options.level === 'company') return company;
          const { branchId } = options;
          if (branchId === undefined) return grants.length > 0;
          return grants.some((grant) => reaches(grant, branchId));
        }
      }
    }) as Can<C>;
}
