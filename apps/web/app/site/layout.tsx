import type { ReactNode } from 'react';

import { RootLayout } from '../root-layout';

// Root layout of the site tree (the public host — ADR-001 · design D1). The website change moves it
// under its `[locale]` segment (FE-IMPL-01).
export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <RootLayout tree="site">{children}</RootLayout>;
}
