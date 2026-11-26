import { Suspense } from 'react';

import { CustomersScreen } from './customers-screen';

// /customers — the customer list (add-customer-management design D11). The screen reads its filters from the
// address, so it renders inside a Suspense boundary (Next.js `useSearchParams`).
export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersScreen />
    </Suspense>
  );
}
