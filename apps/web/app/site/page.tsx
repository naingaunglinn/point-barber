import { connection } from 'next/server';

import { getEnv } from '../../env';
import { RouteTree } from '../../resolve-route';

// Placeholder of the public host — replaced by the home page in add-public-website-pages. Only
// expressions, no literal text (D-PLT-03 · design D11).
export default async function SitePlaceholderPage() {
  await connection(); // rendered per request, so APP_VERSION comes from the running environment
  return (
    <main data-testid="site-placeholder">
      {RouteTree.SITE} {getEnv().APP_VERSION}
    </main>
  );
}
