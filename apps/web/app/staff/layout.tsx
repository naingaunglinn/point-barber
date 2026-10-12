import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { LOCALE_COOKIE, resolveLocale } from '@point/i18n';

import { RootLayout } from '../root-layout';

// Root layout of the staff tree (`app.<domain>` — ADR-001 · design D1). Its language is the account's
// (design D6); before a session exists — and until add-foundation-auth-access supplies one — it is the
// cookie `point_locale`, else the system default (AD-L10N-06).
export default async function StaffLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = resolveLocale({ cookie: (await cookies()).get(LOCALE_COOKIE)?.value });
  return (
    <RootLayout tree="staff" locale={locale}>
      {children}
    </RootLayout>
  );
}
