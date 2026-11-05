'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { Problem, SettingKey, SettingView } from '@point/shared';
import { Button, FormAlert, toast } from '@point/ui';

import { ApiProblem } from '../../../lib/api/client';
import { useResetSetting } from '../../../lib/settings/queries';
import { HistoryDrawer } from './HistoryDrawer';
import { OverridesDrawer } from './OverridesDrawer';

// The entries under a row of Additional settings (AD-SET-02 · AD-SET-03 · P1.SET.04 · design D10 · tasks
// 5.8 / 5.10): History on every row; "Override for a branch" only on a key whose scope is `branch`;
// "Reset to default" on a company value the user may change whose source is Company.

export function RowActions({
  settingKey,
  view,
  label,
}: Readonly<{ settingKey: SettingKey; view: SettingView; label: string }>) {
  const t = useTranslations('settings');
  const [drawer, setDrawer] = useState<'history' | 'overrides' | null>(null);
  const [alert, setAlert] = useState<Pick<Problem, 'code' | 'request_id'> | null>(null);
  const reset = useResetSetting();
  const testId = `setting-${settingKey}`;
  const resetToDefault = async () => {
    setAlert(null);
    try {
      await reset.mutateAsync({ key: settingKey });
      toast.success(t('toast.saved'));
    } catch (failure) {
      if (!(failure instanceof ApiProblem)) throw failure;
      setAlert(failure.problem);
    }
  };
  return (
    <div className="flex w-full flex-col gap-2">
      {alert === null ? null : <FormAlert problem={alert} />}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          onClick={() => setDrawer('history')}
          data-testid={`${testId}-history-open`}
        >
          {t('action.history')}
        </Button>
        {view.definition.scope === 'branch' ? (
          <Button
            variant="ghost"
            onClick={() => setDrawer('overrides')}
            data-testid={`${testId}-overrides-open`}
          >
            {t('action.override')}
          </Button>
        ) : null}
        {view.editable && view.source === 'company' ? (
          <Button
            variant="ghost"
            loading={reset.isPending}
            onClick={() => void resetToDefault()}
            data-testid={`${testId}-reset-default`}
          >
            {t('action.reset_default')}
          </Button>
        ) : null}
      </div>
      {/* Mounted only while open: a closed drawer per row would cost every render of the screen. */}
      {drawer === 'history' ? (
        <HistoryDrawer
          settingKey={settingKey}
          label={label}
          open
          onOpenChange={(open) => setDrawer(open ? 'history' : null)}
        />
      ) : null}
      {drawer === 'overrides' ? (
        <OverridesDrawer
          settingKey={settingKey}
          label={label}
          open
          onOpenChange={(open) => setDrawer(open ? 'overrides' : null)}
        />
      ) : null}
    </div>
  );
}
