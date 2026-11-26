import { cookies } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { LOCALE_COOKIE, loadMessages, resolveLocale } from '@point/i18n';

import { ICON_FILES } from '../../lib/pwa/manifest';
import { themeColour } from '../../lib/pwa/theme-colour';
import { RootLayout } from '../root-layout';
import { StaffProviders } from './providers';

// The head every staff page carries, the login screen included, so the app can be installed before the first
// sign-in (add-pwa-install design D4 · PW5 · AD-PWA-01): the manifest, the Apple touch icon, the iOS
// standalone flags and `viewport-fit=cover` (the bottom navigation's safe-area padding needs it).
// Next.js 16.3.8 emits only `mobile-web-app-capable` for `appleWebApp.capable`; the Apple tag of the same
// name beginning `apple-` is therefore added through `other`, and nothing else emits it — the render test
// pins both tags so an upgrade that changes this fails there, not on an iPhone. The short name is the
// Home Screen label (PW4).
const MESSAGES = loadMessages('my');

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  icons: { apple: { url: ICON_FILES.appleTouch, sizes: '180x180' } },
  appleWebApp: { capable: true, title: MESSAGES.pwa.manifest.shortName, statusBarStyle: 'default' },
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: themeColour(),
  viewportFit: 'cover',
};

// Root layout of the staff tree (`app.<domain>` — ADR-001 · design D1). The first paint is in the
// language of the cookie `point_locale`, else the system default (AD-L10N-06); once `/me` has
// answered, the session layer makes the page follow the account and rewrites the cookie
// (add-foundation-auth-access design D13 · D17).
export default async function StaffLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = resolveLocale({ cookie: (await cookies()).get(LOCALE_COOKIE)?.value });
  return (
    <RootLayout tree="staff" locale={locale}>
      <StaffProviders locale={locale} messages={loadMessages(locale)}>
        {children}
      </StaffProviders>
    </RootLayout>
  );
}
