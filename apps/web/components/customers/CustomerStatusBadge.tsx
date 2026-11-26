'use client';

import { CustomerStatus } from '@point/shared';
import { StatusBadge } from '@point/ui';

// The status badge of a customer (AD-CMP-05 master data · add-customer-management proposal reading 13 ·
// design D11): an INACTIVE customer shows the muted badge and an archived one the muted "Archived" badge
// (it keeps its status — reading 5); an ACTIVE, non-archived customer shows none.
export function CustomerStatusBadge({
  status,
  archived,
  'data-testid': testId,
}: Readonly<{ status: CustomerStatus; archived: boolean; 'data-testid'?: string }>) {
  if (archived) {
    return (
      <span data-testid={testId}>
        <StatusBadge table="customers" state="ARCHIVED" />
      </span>
    );
  }
  if (status !== CustomerStatus.INACTIVE) return null;
  return (
    <span data-testid={testId}>
      <StatusBadge table="customers" code={CustomerStatus.INACTIVE} />
    </span>
  );
}
