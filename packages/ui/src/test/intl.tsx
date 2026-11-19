import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';

import { loadMessages, type Locale } from '@point/i18n';

// Renders a component inside the language provider, as the catalogue and the screens do (design D6).
export function IntlProvider({
  locale = 'en',
  children,
}: {
  locale?: Locale;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={loadMessages(locale)} timeZone="Asia/Yangon">
      {children}
    </NextIntlClientProvider>
  );
}

export function renderIntl(
  ui: ReactElement,
  { locale = 'en', ...options }: RenderOptions & { locale?: Locale } = {},
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <IntlProvider locale={locale}>{children}</IntlProvider>,
    ...options,
  });
}
