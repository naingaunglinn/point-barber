'use client';

import { Button } from '@point/ui';
import { useTranslations } from 'next-intl';

import type { SavedSubmitState } from './use-saved-submit';

// What a money submit shows while its reply is missing (AD-NET-02 · visits spec "Was it saved?" ·
// add-walkin-visit-checkout tasks 10.9 / 12.8): "Checking whether it was saved…" while the key is looked
// up; when nothing was saved, the inline alert of `pos.saved.notSaved` with Retry, which sends the same
// request with the same key. Nothing otherwise.
export function SavedCheck({
  state,
  onRetry,
}: {
  readonly state: SavedSubmitState;
  readonly onRetry: () => void | Promise<unknown>;
}) {
  const t = useTranslations('pos.saved');
  const tCommon = useTranslations('common.action');
  if (state === 'checking') {
    return (
      <p role="status" className="text-sm" data-testid="saved-checking">
        {t('checking')}
      </p>
    );
  }
  if (state === 'notSaved') {
    return (
      <div
        role="alert"
        className="grid gap-2 rounded-md border border-destructive p-3 text-sm"
        data-testid="saved-not-saved"
      >
        <p>{t('notSaved')}</p>
        <Button onClick={() => onRetry()}>{tCommon('retry')}</Button>
      </div>
    );
  }
  return null;
}
