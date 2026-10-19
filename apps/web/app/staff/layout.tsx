import { NextIntlClientProvider } from 'next-intl';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { LOCALE_COOKIE, loadMessages, resolveLocale } from '@point/i18n';

import { RootLayout } from '../root-layout';
import { StaffProviders } from './providers';

// Root layout of the staff tree (`app.<domain>` — ADR-001 · design D1). The first paint is in the
// language of the cookie `point_locale`, else the system default (AD-L10N-06); once `/me` has
// answered, the session layer makes the page follow the account and rewrites the cookie
// (add-foundation-auth-access design D13 · D17).
export default async function StaffLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = resolveLocale({ cookie: (await cookies()).get(LOCALE_COOKIE)?.value });
  return (
    <RootLayout tree="staff" locale={locale}>
      <NextIntlClientProvider
        locale={locale}
        messages={loadMessages(locale)}
        timeZone="Asia/Yangon"
      >
        <StaffProviders locale={locale}>{children}</StaffProviders>
      </NextIntlClientProvider>
    </RootLayout>
  );
}
