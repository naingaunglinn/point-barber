'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { Locale } from '@point/i18n';

import { Button } from '../../components/Button/Button';
import { LanguageSwitch } from '../../components/LanguageSwitch/LanguageSwitch';
import type { Tree } from '../../fonts';
import { useFormat } from '../../providers/format';
import { PERSONAS, type Persona } from '../personas';

// The catalogue's controls (task 9.1 · AD-IMPL-06 · AD-L10N-06 · design D12): language, theme and persona
// change their query parameter with history.replaceState and re-render the server components with
// router.refresh() — no document navigation, so what a demo holds (a typed amount) stays. The query
// parameters win over the `point_locale` cookie on this page.

export function useCatalogueParam(): (name: 'lang' | 'theme' | 'as', value: string) => void {
  const router = useRouter();
  return (name, value) => {
    const url = new URL(window.location.href);
    url.searchParams.set(name, value);
    window.history.replaceState(null, '', url);
    router.refresh();
  };
}

const PERSONA_LABEL = {
  admin: 'admin',
  manager: 'manager',
  barber: 'barber',
  'branch-holder': 'branchHolder',
} as const;

const TREES: readonly Tree[] = ['staff', 'site'];

export function CatalogueControls({
  lang,
  theme,
  as,
}: {
  readonly lang: Locale;
  readonly theme: Tree;
  readonly as: Persona;
}) {
  const t = useTranslations('devui');
  const set = useCatalogueParam();
  const choice = (current: boolean) => ({
    variant: current ? ('primary' as const) : ('secondary' as const),
    'aria-pressed': current,
  });
  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('control.language')}
      >
        <span className="text-sm font-bold">{t('control.language')}</span>
        <LanguageSwitch value={lang} onChange={(next) => set('lang', next)} />
      </div>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('control.theme')}
      >
        <span className="text-sm font-bold">{t('control.theme')}</span>
        {TREES.map((tree) => (
          <Button key={tree} {...choice(tree === theme)} onClick={() => set('theme', tree)}>
            {t(`theme.${tree}`)}
          </Button>
        ))}
      </div>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('control.persona')}
      >
        <span className="text-sm font-bold">{t('control.persona')}</span>
        {PERSONAS.map((persona) => (
          <Button key={persona} {...choice(persona === as)} onClick={() => set('as', persona)}>
            {t(`persona.${PERSONA_LABEL[persona]}`)}
          </Button>
        ))}
      </div>
    </>
  );
}

export function LanguageSwitchDemo() {
  const { locale } = useFormat('LanguageSwitch demo');
  const set = useCatalogueParam();
  return <LanguageSwitch value={locale} onChange={(next) => set('lang', next)} />;
}
