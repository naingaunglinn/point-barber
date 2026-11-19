import type { ReactNode } from 'react';

import { DEFAULT_LOCALE } from '@point/i18n';

import { RootLayout } from '../root-layout';

// Root layout of the site tree (the public host — ADR-001 · design D1). The website change moves it
// under its `[locale]` segment (FE-IMPL-01), which then sets the language. It reads nothing of the
// request, so it stays static; the error-reporting values are read in RootLayout's own Suspense
// boundary (add-staging-deploy design D10).
export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <RootLayout tree="site" locale={DEFAULT_LOCALE}>
      {children}
    </RootLayout>
  );
}
