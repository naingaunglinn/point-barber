'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { errorMessageKey, type Problem } from '@point/shared';

// A problem that names no field, shown at the top of the form (AD-FORM-04 · API-ERR-01): the text of
// `error.<code>`, and for a server error or a code without a key the short error ID — the first 8
// characters of `request_id` (AD-STATE-03). Never only a toast. `params` fill the message's
// placeholders from the problem's context (`error.branch_in_use` — the three counts).
export function FormAlert({
  problem,
  params,
  'data-testid': testId,
}: Readonly<{
  problem: Pick<Problem, 'code' | 'request_id'>;
  params?: Readonly<Record<string, string | number>>;
  'data-testid'?: string;
}>) {
  const t = useTranslations();
  const key = errorMessageKey(problem.code);
  return (
    <div
      role="alert"
      className="flex gap-2 rounded-md border border-destructive p-3 text-sm text-destructive"
      data-testid={testId}
    >
      <TriangleAlert aria-hidden className="size-5 shrink-0" />
      <div className="flex flex-col gap-1">
        <p>{t(key, params)}</p>
        {key === 'error.internal_error' || key === 'error.unknown' ? (
          <p className="text-foreground">
            {t('common.error.id', { id: problem.request_id.slice(0, 8) })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
