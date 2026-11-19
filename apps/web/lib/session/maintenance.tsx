'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { isLocale } from '@point/i18n';
import { type Instant, type Problem, formatDateTime } from '@point/shared';
import { Button } from '@point/ui';

// Maintenance mode in the staff app (AD-NAV-08 · API-AUTH-06 · D-PLT-08 · AD-L10N-06 · AD-FMT-03 ·
// add-settings-store design D10 · tasks 6.2 / 6.3): a 503 `maintenance` carries the expected end and the
// admin's two messages; the notice replaces the whole screen with the text of the language files, the
// expected end and the message in the page's language (the other as fallback), and "Try again" — it
// offers no Sign out, which would answer 503 as well (proposal reading 8). A user who passes sees the
// banner "Maintenance mode is ON" with its link to Maintenance mode instead.

/** The `context` of a 503 `maintenance` (API-ERR-01). */
export interface MaintenanceState {
  readonly until: Instant | null;
  readonly message_mm: string | null;
  readonly message_en: string | null;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/** The state a 503 `maintenance` problem describes. */
export function maintenanceOf(problem: Problem): MaintenanceState {
  const context = problem.context ?? {};
  return {
    until: text(context.until),
    message_mm: text(context.message_mm),
    message_en: text(context.message_en),
  };
}

export function MaintenanceNotice({
  state,
  onRetry,
}: Readonly<{ state: MaintenanceState; onRetry: () => Promise<unknown> }>) {
  const t = useTranslations('maintenance.notice');
  const raw = useLocale();
  const locale = isLocale(raw) ? raw : 'my';
  const [retrying, setRetrying] = useState(false);
  const message =
    locale === 'en'
      ? (state.message_en ?? state.message_mm)
      : (state.message_mm ?? state.message_en);
  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-4 p-4 text-center"
      data-testid="maintenance-notice"
    >
      <title>{t('title')}</title>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p>{t('body')}</p>
      {state.until === null ? null : (
        <p className="font-semibold" data-testid="maintenance-notice-until">
          {t('until', { datetime: formatDateTime(state.until, { locale }) })}
        </p>
      )}
      {message === null ? null : (
        <p className="break-words" data-testid="maintenance-notice-message">
          {message}
        </p>
      )}
      <Button
        variant="primary"
        loading={retrying}
        data-testid="maintenance-notice-retry"
        onClick={() => {
          setRetrying(true);
          void onRetry().finally(() => setRetrying(false));
        }}
      >
        {t('retry')}
      </Button>
    </main>
  );
}

/** "Maintenance mode is ON" at the top of the content, with the link to turn it off. */
export function MaintenanceBanner() {
  const t = useTranslations('maintenance');
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2"
      data-testid="maintenance-banner"
    >
      <span className="font-semibold">{t('banner')}</span>
      <Link
        href="/settings/maintenance"
        className="font-semibold text-primary underline"
        data-testid="maintenance-banner-link"
      >
        {t('banner_link')}
      </Link>
    </div>
  );
}
