'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';

import { LOCALE_COOKIE, localeCookieUpdate, resolveLocale, type Locale } from '@point/i18n';
import { type MeResponse, ScopeType, localized } from '@point/shared';
import {
  ALL_BRANCHES,
  AppShell,
  BranchSwitcher,
  Button,
  ClockProvider,
  LanguageSwitch,
  Skeleton,
} from '@point/ui';

import { api, setApiHandlers } from '../api/client';
import { GrantsProvider } from './grants';
import { navigation } from './navigate';
import { loginUrl } from './return-to';
import { ME_QUERY_KEY, useMe } from './use-me';

// The session boundary of the signed-in staff area (AD-AUTH-01 · AD-PERM-03 · AD-L10N-06 · AD-NAV-04 ·
// AD-NAV-07 · design D13 · D17). It loads `/me`, installs the one 401 handler (to the login screen with
// the reason and the page to come back to) and the one 403 handler (refetch `/me`), makes the page
// language follow the account — the cookie `point_locale` only mirrors it — and frames the page in the
// AppShell fed by `/me`.

/** The value of a cookie of `document.cookie`. */
export function documentCookie(name: string): string | undefined {
  return document.cookie
    .split(';')
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** The account's language: `ui_language`, else the system default — never the previous cookie. */
export function localeOf(me: MeResponse): Locale {
  return resolveLocale({
    session: { uiLanguage: me.user.ui_language },
    systemDefault: me.system.default_language,
  });
}

/** `POST /v1/auth/logout` → the login screen with "You signed out". */
export async function signOut(): Promise<void> {
  await api('/auth/logout', { method: 'POST', signIn: true }).catch(() => undefined);
  navigation.assign(loginUrl({ reason: 1 }));
}

export function SessionLayer({
  locale,
  children,
}: Readonly<{ locale: Locale; children: ReactNode }>) {
  const me = useMe();
  const client = useQueryClient();
  const router = useRouter();

  useEffect(
    () =>
      setApiHandlers({
        onUnauthorized: (problem) => {
          navigation.assign(
            loginUrl({
              ...(problem.code === 'session_revoked' && problem.reason !== undefined
                ? { reason: problem.reason }
                : {}),
              returnTo: `${window.location.pathname}${window.location.search}`,
            }),
          );
        },
        onForbidden: () => {
          void client.invalidateQueries({ queryKey: ME_QUERY_KEY });
        },
      }),
    [client],
  );

  // After `/me`: the page is in the account's language; the cookie follows it, and the server
  // components render again when it changed (a shared phone never keeps the previous user's language).
  const data = me.data;
  useEffect(() => {
    if (data === undefined) return;
    const update = localeCookieUpdate(localeOf(data), documentCookie(LOCALE_COOKIE));
    if (update === null) return;
    document.cookie = update;
    router.refresh();
  }, [data, router]);

  if (data === undefined) {
    return (
      <main className="p-4" aria-busy="true">
        <Skeleton shape="text" />
      </main>
    );
  }
  return (
    <ClockProvider now={data.system.server_time}>
      <GrantsProvider me={data}>
        <StaffShell me={data} locale={locale}>
          {children}
        </StaffShell>
      </GrantsProvider>
    </ClockProvider>
  );
}

/** The AppShell of the signed-in area: the branch switcher, the language and the user menu. */
function StaffShell({
  me,
  locale,
  children,
}: Readonly<{ me: MeResponse; locale: Locale; children: ReactNode }>) {
  const t = useTranslations('auth.landing');
  const company = me.grants.some((grant) => grant.scope_type === ScopeType.COMPANY);
  const [branch, setBranch] = useState<string>(
    company ? ALL_BRANCHES : (me.branches_in_scope[0]?.id ?? ALL_BRANCHES),
  );
  const client = useQueryClient();
  const setLanguage = (next: Locale) => {
    void api('/me', { method: 'PATCH', body: { ui_language: next === 'en' ? 2 : 1 } }).then(() =>
      client.invalidateQueries({ queryKey: ME_QUERY_KEY }),
    );
  };
  return (
    <AppShell
      nav={[]}
      branchSwitcher={
        me.branches_in_scope.length > 0 ? (
          <BranchSwitcher
            branches={me.branches_in_scope}
            value={branch}
            userId={me.user.id}
            allowAll={company}
            onChange={setBranch}
          />
        ) : undefined
      }
      language={<LanguageSwitch value={locale} onChange={setLanguage} />}
      userMenu={
        <div className="flex items-center gap-2">
          {/* No profile page exists yet (AD-NAV-07 v1.8): the name is text until one does. */}
          <span className="text-sm font-semibold">{localized(me.employee, 'name', locale)}</span>
          <Button variant="ghost" onClick={() => void signOut()}>
            {t('signOut')}
          </Button>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
