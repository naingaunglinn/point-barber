import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';

import { loadMessages, type Locale } from '@point/i18n';
import { FormatProvider } from '@point/ui';

// Renders a staff screen inside the providers of the staff layout (design D17): the language, a fresh
// query cache and the formatting profile. Component tests only (jsdom).
export function renderStaff(
  ui: ReactElement,
  { locale = 'en' }: { readonly locale?: Locale } = {},
): RenderResult & { readonly client: QueryClient } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <NextIntlClientProvider locale={locale} messages={loadMessages(locale)} timeZone="Asia/Yangon">
      <QueryClientProvider client={client}>
        <FormatProvider locale={locale} profile="app">
          {ui}
        </FormatProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
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
