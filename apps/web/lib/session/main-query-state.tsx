'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { HttpStatus } from '@point/shared';
import { ErrorState } from '@point/ui';

import { ApiProblem } from '../api/client';

// The answer of a page whose main query was refused (AD-STATE-04 · AD-PERM-01 · API-PERM-03 · design
// D17): 403 → "You don't have access to this page …", 404 → "This item doesn't exist or was
// archived.", each with a link Home. The client's 403 handler has already loaded `/me` again once, so
// the rest of the screen shows the current grants; a 404 never signs the user out.

export function MainQueryState({
  error,
  children,
}: Readonly<{ error: unknown; children: ReactNode }>) {
  if (
    !(error instanceof ApiProblem) ||
    (error.status !== HttpStatus.FORBIDDEN && error.status !== HttpStatus.NOT_FOUND)
  ) {
    return <>{children}</>;
  }
  return <RefusedPage code={error.status === HttpStatus.FORBIDDEN ? 'forbidden' : 'not_found'} />;
}

/**
 * The 403 or 404 page itself, with its link Home — also for a screen the user's grants do not reach,
 * decided before any request (add-company-profile: Settings › Company without a `company.*` code).
 */
export function RefusedPage({ code }: Readonly<{ code: 'forbidden' | 'not_found' }>) {
  const t = useTranslations('auth.landing');
  return (
    <div className="flex flex-col items-center gap-3 p-4" data-testid="refused-page">
      <ErrorState problem={{ code }} />
      <Link href="/" className="font-semibold text-primary underline">
        {t('home')}
      </Link>
    </div>
  );
}
