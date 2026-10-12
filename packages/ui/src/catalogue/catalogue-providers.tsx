'use client';

import type { ReactNode } from 'react';

import type { Locale } from '@point/i18n';

import { Toaster } from '../components/Toaster/Toaster';
import type { Tree } from '../fonts';
import { FormatProvider } from '../providers/format';
import { FixtureGrantsProvider } from './fixture-grants';
import { PERSONA_GRANTS, type Persona } from './personas';

// What every demo of the catalogue reads (design D12): the language and the money profile of the
// `theme` parameter (staff → `app`, site → `site`), and the grants of the `as` persona over the
// fixture catalogue. The clock is the page's ClockProvider.
export function CatalogueProviders({
  lang,
  theme,
  as,
  children,
}: {
  readonly lang: Locale;
  readonly theme: Tree;
  readonly as: Persona;
  readonly children: ReactNode;
}) {
  return (
    <FormatProvider locale={lang} profile={theme === 'site' ? 'site' : 'app'}>
      <FixtureGrantsProvider me={PERSONA_GRANTS[as]}>
        {children}
        <Toaster />
      </FixtureGrantsProvider>
    </FormatProvider>
  );
}
