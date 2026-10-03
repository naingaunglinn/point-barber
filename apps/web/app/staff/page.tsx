import { connection } from 'next/server';

import { getEnv } from '../../env';
import { RouteTree } from '../../resolve-route';

// Placeholder of the staff host — replaced by the login screen in add-foundation-auth-access. Only
// expressions, no literal text (D-PLT-03 · design D11).
export default async function StaffPlaceholderPage() {
  await connection(); // rendered per request, so APP_VERSION comes from the running environment
  return (
    <main data-testid="staff-placeholder">
      {RouteTree.STAFF} {getEnv().APP_VERSION}
    </main>
  );
}
