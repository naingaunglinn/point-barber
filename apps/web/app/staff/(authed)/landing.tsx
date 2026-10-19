'use client';

import { useLocale, useTranslations } from 'next-intl';

import { isLocale } from '@point/i18n';
import { localized } from '@point/shared';
import { Button, LanguageSwitch } from '@point/ui';

import { signOut, useSetLanguage } from '../../../lib/session/session-layer';
import { useGrantsMe } from '../../../lib/session/grants';
import { useMe } from '../../../lib/session/use-me';

// The start page (auth spec "After sign-in the start page shows who is signed in and their branches"
// · API-AUTH-05 · AD-NAV-04 · AD-NAV-07 · AD-L10N-03 · design D17): from `/me` only — the name in the
// interface language, the e-mail, the branches in scope, the language switch and Sign out.
export function LandingPage() {
  const t = useTranslations('auth.landing');
  const raw = useLocale();
  const locale = isLocale(raw) ? raw : 'my';
  const me = useMe().data;
  const grants = useGrantsMe();
  const setLanguage = useSetLanguage();
  if (me === undefined) return null;
  return (
    <main className="flex max-w-xl flex-col gap-6 p-4">
      <section className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{t('signedInAs')}</p>
        <p data-testid="landing-name" className="text-xl font-bold">
          {localized(me.employee, 'name', locale)}
        </p>
        <p data-testid="landing-email" className="text-muted-foreground">
          {me.user.email}
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('branches')}</h2>
        <ul data-testid="landing-branches" className="flex flex-col gap-1">
          {grants.branches_in_scope.map((branch) => (
            <li key={branch.id} data-branch={branch.code}>
              {t('branchItem', { code: branch.code, name: localized(branch, 'name', locale) })}
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <LanguageSwitch value={locale} onChange={setLanguage} />
        <Button data-testid="landing-sign-out" onClick={() => void signOut()}>
          {t('signOut')}
        </Button>
      </div>
    </main>
  );
}
