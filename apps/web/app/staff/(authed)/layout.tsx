import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { LOCALE_COOKIE, resolveLocale } from '@point/i18n';

import { SessionLayer } from '../../../lib/session/session-layer';

// The signed-in area of the staff tree (design D17): every page below needs a session. proxy.ts has
// already sent a browser without the cookie to the login screen; the API decides whether the session
// is valid, and the session layer follows its answer.
export default async function AuthedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = resolveLocale({ cookie: (await cookies()).get(LOCALE_COOKIE)?.value });
  return <SessionLayer locale={locale}>{children}</SessionLayer>;
}
