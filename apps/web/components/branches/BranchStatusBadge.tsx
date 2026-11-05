'use client';

import { BranchStatus } from '@point/shared';
import { StatusBadge } from '@point/ui';

// The status badge of a branch (AD-CMP-05 master data · add-branch-management design D9): an INACTIVE
// branch shows the muted badge, an ACTIVE one shows none — ACTIVE is the default of master data.
export function BranchStatusBadge({
  status,
  'data-testid': testId,
}: Readonly<{ status: BranchStatus; 'data-testid'?: string }>) {
  if (status !== BranchStatus.INACTIVE) return null;
  return (
    <span data-testid={testId}>
      <StatusBadge table="branches" code={BranchStatus.INACTIVE} />
    </span>
  );
}
