'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { errorMessageKey, type Problem } from '@point/shared';

// A problem that names no field, shown at the top of the form (AD-FORM-04 · API-ERR-01): the text of
// `error.<code>`, and for a server error the short error ID — the first 8 characters of `request_id`
// (AD-STATE-03). Never only a toast.
export function FormAlert({
  problem,
}: Readonly<{ problem: Pick<Problem, 'code' | 'request_id'> }>) {
  const t = useTranslations();
  const key = errorMessageKey(problem.code);
  return (
    <div
      role="alert"
      className="flex gap-2 rounded-md border border-destructive p-3 text-sm text-destructive"
    >
      <TriangleAlert aria-hidden className="size-5 shrink-0" />
      <div className="flex flex-col gap-1">
        <p>{t(key)}</p>
        {key === 'error.internal_error' ? (
          <p className="text-foreground">
            {t('common.error.id', { id: problem.request_id.slice(0, 8) })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
