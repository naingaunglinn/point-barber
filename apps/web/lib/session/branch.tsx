'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { type BranchSummary, type MeResponse, ScopeType } from '@point/shared';
import { ALL_BRANCHES } from '@point/ui';

// The branch context of the signed-in area (AD-NAV-04 · AD-TODAY-03 · add-walkin-visit-checkout design
// D11): the chip's choice, and the branch a START uses. The default follows AD-NAV-04 — today's shift /
// attendance branch (`today_branch_id`, null until scheduling exists), then the device's last choice
// (BranchSwitcher keeps it), then the first active branch assignment. With "All branches" chosen (a
// company-scope user) START uses the same order — recorded reading of design D11 (20/Oct/2026).

export interface BranchContextValue {
  /** The chip's value: a branch id or ALL_BRANCHES. */
  readonly branchId: string;
  readonly setBranchId: (id: string) => void;
  /** The branch START records the visit at; null when the user has none in scope. */
  readonly startBranch: BranchSummary | null;
}

const BranchContext = createContext<BranchContextValue | null>(null);

/** The barber default of AD-NAV-04 without the device choice: today's branch, else the first assignment. */
export function defaultBranchId(me: MeResponse): string | undefined {
  return me.today_branch_id ?? me.assigned_branch_ids[0];
}

/** The chip's first value: "All branches" for a company-scope user, else the AD-NAV-04 default. */
export function initialBranchId(me: MeResponse): string {
  if (me.grants.some((grant) => grant.scope_type === ScopeType.COMPANY)) return ALL_BRANCHES;
  return defaultBranchId(me) ?? me.branches_in_scope[0]?.id ?? ALL_BRANCHES;
}

export function startBranchOf(me: MeResponse, branchId: string): BranchSummary | null {
  const id = branchId === ALL_BRANCHES ? defaultBranchId(me) : branchId;
  return me.branches_in_scope.find((branch) => branch.id === id) ?? null;
}

export function BranchProvider({
  value,
  children,
}: Readonly<{ value: BranchContextValue; children: ReactNode }>) {
  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchContextValue {
  const value = useContext(BranchContext);
  if (value === null) throw new Error('useBranch() needs the signed-in area (BranchProvider)');
  return value;
}
