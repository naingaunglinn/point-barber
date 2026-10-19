'use client';

import type { ReactNode } from 'react';

import type { Locale } from '@point/i18n';
import { FormatProvider, QueryProvider, Toaster } from '@point/ui';

// What every staff screen reads (design D17): the query cache, the formatting profile of the app and
// the toaster.
export function StaffProviders({
  locale,
  children,
}: Readonly<{ locale: Locale; children: ReactNode }>) {
  return (
    <QueryProvider>
      <FormatProvider locale={locale} profile="app">
        {children}
        <Toaster />
      </FormatProvider>
    </QueryProvider>
  );
}
