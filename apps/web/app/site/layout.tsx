import type { ReactNode } from 'react';

import { DEFAULT_LOCALE } from '@point/i18n';

import { RootLayout } from '../root-layout';

// Root layout of the site tree (the public host — ADR-001 · design D1). The website change moves it
// under its `[locale]` segment (FE-IMPL-01), which then sets the language.
export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <RootLayout tree="site" locale={DEFAULT_LOCALE}>
      {children}
    </RootLayout>
  );
}
