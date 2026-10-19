import { type Locale, loadMessages } from '@point/i18n';
import { ClockProvider, FormatProvider } from '@point/ui';
import { type RenderOptions, type RenderResult, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';

// Renders a screen part as the staff app does: the language, the money / date formats of that language and
// a fixed clock (05/Oct/2026 10:42 AM in Yangon, the fixture day of the walk-in specs).
export const FIXTURE_NOW = '2026-10-05T10:42:00+06:30';

export function renderStaff(
  ui: ReactElement,
  {
    locale = 'en',
    now = FIXTURE_NOW,
    ...options
  }: RenderOptions & { readonly locale?: Locale; readonly now?: string } = {},
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider
        locale={locale}
        messages={loadMessages(locale)}
        timeZone="Asia/Yangon"
      >
        <FormatProvider locale={locale} profile="app">
          <ClockProvider now={now as never}>{children}</ClockProvider>
        </FormatProvider>
      </NextIntlClientProvider>
    ),
    ...options,
  });
}
