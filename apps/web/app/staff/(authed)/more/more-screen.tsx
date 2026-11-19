'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';

import { isLocale } from '@point/i18n';
import { localized } from '@point/shared';
import { Button, LanguageSwitch, PageHeader } from '@point/ui';

import { useSettingsScreens } from '../../../../components/settings/settings-nav';
import { signOut, useSetLanguage } from '../../../../lib/session/session-layer';
import { useMe } from '../../../../lib/session/use-me';

// More — the last item of the phone's bottom navigation (AD-NAV-01 · AD-LAY-03 · AD-NAV-07 ·
// add-walkin-visit-checkout task 10.1, owner 28/Oct/2026): the items of the user menu that exist now — who
// is signed in, the MM / EN switch (saved on the account, AD-L10N-06) and Sign out. On a phone the top bar
// has no user menu, so this is where they live; the modules of later changes join this menu. The Settings
// list (AD-NAV-02 · add-company-profile design D8 · proposal reading 13) holds the Settings screens the
// user may open; it is not shown when there is none.
export function MoreScreen() {
  const tCommon = useTranslations('common.action');
  const t = useTranslations('auth.landing');
  const tSettings = useTranslations('settings.nav');
  const raw = useLocale();
  const locale = isLocale(raw) ? raw : 'my';
  const me = useMe().data;
  const setLanguage = useSetLanguage();
  const settings = useSettingsScreens();
  const settingsHeading = useId();
  if (me === undefined) return null;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6" data-testid="more">
      {/* The page title is the screen's name (WCAG 2.4.2 · AD-A11Y-01 — task 13.8). */}
      <title>{tCommon('more')}</title>
      <PageHeader title={tCommon('more')} />
      <section className="grid gap-1">
        <p className="text-sm text-muted-foreground">{t('signedInAs')}</p>
        <p className="text-xl font-semibold" data-testid="more-name">
          {localized(me.employee, 'name', locale)}
        </p>
      </section>
      {settings.length === 0 ? null : (
        <nav aria-labelledby={settingsHeading} className="grid gap-1" data-testid="more-settings">
          <h2 id={settingsHeading} className="text-sm text-muted-foreground">
            {tSettings('title')}
          </h2>
          <ul className="grid divide-y divide-border rounded-md border border-border">
            {settings.map((screen) => (
              <li key={screen.key}>
                <Link
                  href={screen.href}
                  data-testid={`more-settings-${screen.key}`}
                  className="flex min-h-12 items-center justify-between gap-2 px-3 font-semibold break-words hover:bg-muted"
                >
                  <span>{screen.label}</span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <LanguageSwitch value={locale} onChange={setLanguage} />
      <Button fullWidth data-testid="more-sign-out" onClick={() => void signOut()}>
        {t('signOut')}
      </Button>
    </div>
  );
}
