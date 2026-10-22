import { type Locale, loadMessages } from '@point/i18n';
import { ClockProvider, FormatProvider } from '@point/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RenderOptions, type RenderResult, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';

// Renders a staff screen inside the providers of the staff layout (design D17): the language, a fresh
// query cache, the money / date formats of that language and a fixed clock (05/Oct/2026 10:42 AM in
// Yangon, the fixture day of the walk-in specs). Component tests only (jsdom).
export const FIXTURE_NOW = '2026-10-05T10:42:00+06:30';

export function renderStaff(
  ui: ReactElement,
  {
    locale = 'en',
    now = FIXTURE_NOW,
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    ...options
  }: RenderOptions & {
    readonly locale?: Locale;
    readonly now?: string;
    /** A query cache the test filled first (e.g. `/me`). */
    readonly client?: QueryClient;
  } = {},
): RenderResult & { readonly client: QueryClient } {
  const result = render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider
        locale={locale}
        messages={loadMessages(locale)}
        timeZone="Asia/Yangon"
      >
        <QueryClientProvider client={client}>
          <FormatProvider locale={locale} profile="app">
            <ClockProvider now={now as never}>{children}</ClockProvider>
          </FormatProvider>
        </QueryClientProvider>
      </NextIntlClientProvider>
    ),
    ...options,
  });
  return { ...result, client };
}

/** A JSON response for a mocked fetch. */
export function json(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** A problem body (API-ERR-01). */
export const problem = (status: number, code: string, extra: object = {}) => ({
  type: 'about:blank',
  title: code,
  status,
  code,
  request_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70',
  ...extra,
});
