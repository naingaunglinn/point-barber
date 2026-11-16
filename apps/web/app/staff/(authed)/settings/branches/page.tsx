import { Suspense } from 'react';

import { BranchesScreen } from './branches-screen';

// /settings/branches — Settings › Branches (add-branch-management design D9). The screen reads its status
// filter from the address, so it renders inside a Suspense boundary (Next.js `useSearchParams`).
export default function BranchesPage() {
  return (
    <Suspense>
      <BranchesScreen />
    </Suspense>
  );
}
