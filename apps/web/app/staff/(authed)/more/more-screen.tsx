'use client';

import { useLocale, useTranslations } from 'next-intl';

import { isLocale } from '@point/i18n';
import { localized } from '@point/shared';
import { Button, LanguageSwitch, PageHeader } from '@point/ui';

import { signOut, useSetLanguage } from '../../../../lib/session/session-layer';
import { useMe } from '../../../../lib/session/use-me';

// More — the last item of the phone's bottom navigation (AD-NAV-01 · AD-LAY-03 · AD-NAV-07 ·
// add-walkin-visit-checkout task 10.1, owner 28/Oct/2026): the items of the user menu that exist now — who
// is signed in, the MM / EN switch (saved on the account, AD-L10N-06) and Sign out. On a phone the top bar
// has no user menu, so this is where they live; the modules of later changes join this menu.
export function MoreScreen() {
  const tCommon = useTranslations('common.action');
  const t = useTranslations('auth.landing');
  const raw = useLocale();
  const locale = isLocale(raw) ? raw : 'my';
  const me = useMe().data;
  const setLanguage = useSetLanguage();
  if (me === undefined) return null;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6" data-testid="more">
      <PageHeader title={tCommon('more')} />
      <section className="grid gap-1">
        <p className="text-sm text-muted-foreground">{t('signedInAs')}</p>
        <p className="text-xl font-semibold" data-testid="more-name">
          {localized(me.employee, 'name', locale)}
        </p>
      </section>
      <LanguageSwitch value={locale} onChange={setLanguage} />
      <Button fullWidth data-testid="more-sign-out" onClick={() => void signOut()}>
        {t('signOut')}
      </Button>
    </div>
  );
}
