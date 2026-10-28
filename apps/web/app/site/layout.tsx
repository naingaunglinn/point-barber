import { connection } from 'next/server';
import type { ReactNode } from 'react';

import { DEFAULT_LOCALE } from '@point/i18n';

import { getEnv } from '../../env';
import { reportingOf } from '../../lib/observability/options';
import { RootLayout } from '../root-layout';

// Root layout of the site tree (the public host — ADR-001 · design D1). The website change moves it
// under its `[locale]` segment (FE-IMPL-01), which then sets the language. It is rendered per request
// (`connection()` before the environment is read — `next build` prerenders nothing here), so the
// error-reporting values are those of the running environment (design D10).
export default async function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  await connection();
  return (
    <RootLayout tree="site" locale={DEFAULT_LOCALE} reporting={reportingOf(getEnv())}>
      {children}
    </RootLayout>
  );
}
