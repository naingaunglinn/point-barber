import { Suspense } from 'react';

import { LeaveTypesScreen } from './leave-types-screen';

// /settings/leave-types — Settings › Leave types (add-leave-types design D9). The screen reads its status
// filter from the address, so it renders inside a Suspense boundary (Next.js `useSearchParams`).
export default function LeaveTypesPage() {
  return (
    <Suspense>
      <LeaveTypesScreen />
    </Suspense>
  );
}
