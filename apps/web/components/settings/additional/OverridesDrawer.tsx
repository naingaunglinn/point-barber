'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { localized, type Problem, type SettingKey } from '@point/shared';
import { Button, Drawer, ErrorState, FormAlert, Skeleton, toast, useFormat } from '@point/ui';

import { ApiProblem } from '../../../lib/api/client';
import { screenProblem } from '../../../lib/pos/problem';
import { useCan } from '../../../lib/session/grants';
import { useMe } from '../../../lib/session/use-me';
import { useResetSetting, useSettings } from '../../../lib/settings/queries';
import { SettingForm } from './SettingForm';
import { type Translate, formatSettingValue } from './setting-values';
import { SourceBadge } from './SourceBadge';

// "Override for a branch" of a branch-scoped key (AD-SET-02 · P1.SET.01 / 03 / 04 · owner SS3 = C · design
// D10 · tasks 5.8 / 5.9): each branch the user's settings grant covers, with its effective value and
// source badge — "Point 3.0 · 3,000 Ks · Branch override" — then, where the user may change it, the same
// form as a row (the transport fee asks first here too) and "Reset to company value" on an override.
// One query per covered branch, loaded while the drawer is open.

function BranchOverride({
  settingKey,
  branchId,
  name,
}: Readonly<{ settingKey: SettingKey; branchId: string; name: string }>) {
  const t = useTranslations('settings');
  const tAny = useTranslations() as unknown as Translate;
  const format = useFormat('BranchOverride');
  const list = useSettings(branchId);
  const reset = useResetSetting();
  const [alert, setAlert] = useState<Pick<Problem, 'code' | 'request_id'> | null>(null);
  const testId = `setting-${settingKey}-branch-${branchId}`;
  const resetToCompany = async () => {
    setAlert(null);
    try {
      await reset.mutateAsync({ key: settingKey, branchId });
      toast.success(t('toast.saved'));
    } catch (failure) {
      // No answer at all (no network) is not an ApiProblem: the alert says so (CG-ERR-01).
      setAlert(failure instanceof ApiProblem ? failure.problem : screenProblem(failure));
    }
  };
  // A failed load in the background (window focus) keeps the branch shown and what was typed.
  const view = list.data?.items.find((item) => item.key === settingKey);
  if (view === undefined) {
    return (
      <li className="py-3">
        {list.data === undefined && list.isError ? (
          <ErrorState problem={screenProblem(list.error)} onRetry={() => list.refetch()} />
        ) : (
          <div aria-busy="true">
            <Skeleton shape="text" />
          </div>
        )}
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-3 py-3" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{name}</span>
        <span className="flex items-center gap-2">
          <span data-testid={`${testId}-value`}>
            {formatSettingValue(settingKey, view.effective, { t: tAny, ...format })}
          </span>
          <SourceBadge source={view.source} />
        </span>
      </div>
      {alert === null ? null : <FormAlert problem={alert} />}
      {view.editable ? (
        <SettingForm
          key={JSON.stringify(view.effective)}
          settingKey={settingKey}
          view={view}
          branchId={branchId}
          label={name}
          testId={`${testId}-form`}
        />
      ) : null}
      {view.editable && view.source === 'branch' ? (
        <div>
          <Button
            loading={reset.isPending}
            data-testid={`${testId}-reset`}
            onClick={() => void resetToCompany()}
          >
            {t('action.reset_company')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function OverridesDrawer({
  settingKey,
  label,
  open,
  onOpenChange,
}: Readonly<{
  settingKey: SettingKey;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useTranslations('settings');
  const format = useFormat('OverridesDrawer');
  const can = useCan();
  const me = useMe().data;
  const branches = (me?.branches_in_scope ?? []).filter(
    (branch) =>
      can('settings.view', { branchId: branch.id }) ||
      can('settings.update', { branchId: branch.id }),
  );
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={t('action.override')}>
      <div className="flex flex-col gap-2" data-testid={`setting-${settingKey}-overrides`}>
        <p className="font-semibold">{label}</p>
        {open ? (
          <ul className="flex flex-col divide-y divide-border">
            {branches.map((branch) => (
              <BranchOverride
                key={branch.id}
                settingKey={settingKey}
                branchId={branch.id}
                name={localized(branch, 'name', format.locale)}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </Drawer>
  );
}
