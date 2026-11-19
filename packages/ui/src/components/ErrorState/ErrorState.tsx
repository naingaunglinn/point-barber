'use client';

import { CircleX } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { errorMessageKey } from '@point/shared';

import { Button } from '../Button/Button';

// A failed load or action (API-ERR-01 · API-ERR-02 · AD-STATE-03 · AD-STATE-04 · design D10): the text of
// `error.<code>` with the problem's params — never its `detail` — and, when the problem carries one,
// the short error ID (the first 8 characters of `request_id`). A code without a key reads as
// `error.unknown`. Retry only when the caller gives a handler, that is when retrying is safe.

export interface ErrorProblem {
  readonly code: string;
  readonly params?: Readonly<Record<string, string | number>>;
  readonly request_id?: string;
}

export interface ErrorStateProps {
  readonly problem: ErrorProblem;
  readonly onRetry?: () => void | Promise<unknown>;
}

export function ErrorState({ problem, onRetry }: ErrorStateProps) {
  const t = useTranslations();
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-border px-4 py-8 text-center"
      data-slot="error-state"
    >
      <CircleX aria-hidden className="size-8 text-destructive" />
      <p className="max-w-prose">{t(errorMessageKey(problem.code), problem.params)}</p>
      {problem.request_id === undefined ? null : (
        <p className="font-numeric text-sm text-muted-foreground" data-slot="error-id">
          {t('common.error.id', { id: problem.request_id.slice(0, 8) })}
        </p>
      )}
      {onRetry === undefined ? null : <Button onClick={onRetry}>{t('common.action.retry')}</Button>}
    </div>
  );
}
