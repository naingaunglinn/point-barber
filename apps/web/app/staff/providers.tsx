'use client';

import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

import type { Locale, Messages } from '@point/i18n';
import { FormatProvider, QueryProvider, Toaster } from '@point/ui';

// What every staff screen reads (design D17): the language files of the page's language, the query
// cache, the formatting profile of the app and the toaster. The language provider is created here, on
// the client, so next-intl needs no request configuration of its own (the server layout hands the
// language and its messages down).
export function StaffProviders({
  locale,
  messages,
  children,
}: Readonly<{ locale: Locale; messages: Messages; children: ReactNode }>) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Yangon">
      <QueryProvider>
        <FormatProvider locale={locale} profile="app">
          {children}
          <Toaster />
        </FormatProvider>
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
