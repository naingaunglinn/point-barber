'use client';

import { cn } from 'cn';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { LOCALES, localeCookie, type Locale } from '@point/i18n';
import { hasMyanmarScript } from '@point/shared';

// The language switch MM / EN (AD-NAV-07 · AD-L10N-06 · design D6 / D10): writes the cookie
// `point_locale` and refreshes the server components, so every string changes at once while the
// client state and the query cache stay. Saving `users.ui_language` is the caller's `onChange`
// (add-foundation-auth-access).

/** The option labels of AD-NAV-07; the accessible name is the language, in the UI language. */
const SHORT: Readonly<Record<Locale, string>> = { my: 'MM', en: 'EN' };
const NAME_KEY = { my: 'bilingual.mm', en: 'bilingual.en' } as const;

export interface LanguageSwitchProps {
  readonly value: Locale;
  readonly onChange?: (locale: Locale) => void;
}

export function LanguageSwitch({ value, onChange }: LanguageSwitchProps) {
  const t = useTranslations('common');
  const router = useRouter();
  const choose = (locale: Locale) => {
    if (locale === value) return;
    document.cookie = localeCookie(locale);
    router.refresh();
    onChange?.(locale);
  };
  return (
    <div
      role="group"
      className="inline-flex gap-2 rounded-md border border-border p-0.5"
      data-slot="language-switch"
    >
      {LOCALES.map((locale) => {
        const name = t(NAME_KEY[locale]);
        return (
          <button
            key={locale}
            type="button"
            aria-pressed={locale === value}
            aria-label={name}
            lang={hasMyanmarScript(name) ? 'my' : undefined}
            onClick={() => choose(locale)}
            className={cn(
              "relative h-10 min-w-11 rounded-sm px-3 text-sm font-semibold after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-['']",
              locale === value
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-muted',
            )}
          >
            {SHORT[locale]}
          </button>
        );
      })}
    </div>
  );
}
