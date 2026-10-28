import type { ReactNode } from 'react';

import { DEFAULT_LOCALE } from '@point/i18n';

import { getEnv } from '../../env';
import { reportingOf } from '../../lib/observability/options';
import { RootLayout } from '../root-layout';

// Root layout of the site tree (the public host — ADR-001 · design D1). The website change moves it
// under its `[locale]` segment (FE-IMPL-01), which then sets the language. Its page is rendered per
// request, so the error-reporting values are those of the running environment (design D10).
export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <RootLayout tree="site" locale={DEFAULT_LOCALE} reporting={reportingOf(getEnv())}>
      {children}
    </RootLayout>
  );
}
