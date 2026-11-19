'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { Locale, MoneyProfile } from '@point/shared';

// The language and the money profile of the formatters (AD-FMT-00 · AD-FMT-01 · FE-FMT-01 · design
// D10): `app` writes ကျပ် in Myanmar and Ks in English, `site` writes Ks in both. The staff tree
// provides `app`, the website `site`; the catalogue follows its `theme` parameter.

export interface FormatSettings {
  readonly locale: Locale;
  readonly profile: MoneyProfile;
}

const FormatContext = createContext<FormatSettings | null>(null);

export function FormatProvider({
  locale,
  profile,
  children,
}: FormatSettings & { readonly children: ReactNode }) {
  return <FormatContext.Provider value={{ locale, profile }}>{children}</FormatContext.Provider>;
}

/** The provider's settings; `component` names the caller in the error when there is none. */
export function useFormat(component: string): FormatSettings {
  const settings = useContext(FormatContext);
  if (settings === null) throw new Error(`${component} needs a FormatProvider`);
  return settings;
}
