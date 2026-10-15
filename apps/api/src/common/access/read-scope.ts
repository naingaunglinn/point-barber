// The branches a caller may read (ADR-012 · API-PERM-03): every branch (a company-scope grant), or
// the listed ones. The access guard of add-foundation-auth-access resolves it; the services of
// add-walkin-visit-checkout take it as an input, so they never read the grants themselves.
export type ReadScope = 'all' | readonly string[];

export function inReadScope(scope: ReadScope, branchId: string): boolean {
  return scope === 'all' || scope.includes(branchId);
}
