'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type SettingKey, type SettingView, isSettingKey } from '@point/shared';
import { useFormat } from '@point/ui';

import { useCan } from '../../../lib/session/grants';
import { RowActions } from './RowActions';
import { SettingForm } from './SettingForm';
import { type Translate, formatSettingValue } from './setting-values';
import { SourceBadge } from './SourceBadge';

// One row of Additional settings (AD-SET-01 · AD-PERM-02 · owner SS4 · design D10 · tasks 5.4, 5.7): the
// label and help of the language files, the source badge, and either the control — when `editable` is
// true — or the value as text. The tax and service-charge switches and `system.maintenance` are
// read-only; the maintenance row links to Maintenance mode for a company-scope settings.update holder.
// Under it, the row's History, override and reset entries (RowActions).

export function SettingRow({ view }: Readonly<{ view: SettingView }>) {
  const t = useTranslations() as unknown as Translate;
  const tNav = useTranslations('settings.nav');
  const format = useFormat('SettingRow');
  const can = useCan();
  if (!isSettingKey(view.key)) return null; // a key this app does not know yet (a newer API)
  const key: SettingKey = view.key;
  const label = t(view.definition.label_key);
  const helper = view.definition.help_key === null ? undefined : t(view.definition.help_key);
  const testId = `setting-${key}`;
  return (
    <section
      className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0"
      data-testid={`${testId}-row`}
      data-editable={view.editable}
    >
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {view.editable ? (
            <SettingForm
              // A new stored value (a reset, another device's save) gives the control that value; a
              // refetch with the same value keeps what the user is typing.
              key={JSON.stringify(view.effective)}
              settingKey={key}
              view={view}
              label={label}
              {...(helper === undefined ? {} : { helper })}
              testId={testId}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold">{label}</p>
              <p className="break-words" data-testid={`${testId}-value`}>
                {formatSettingValue(key, view.effective, { t, ...format })}
              </p>
              {helper === undefined ? null : (
                <p className="text-sm text-muted-foreground">{helper}</p>
              )}
              {key === 'system.maintenance' && can('settings.update', { level: 'company' }) ? (
                <Link
                  href="/settings/maintenance"
                  className="font-semibold text-primary underline"
                  data-testid={`${testId}-link`}
                >
                  {tNav('maintenance')}
                </Link>
              ) : null}
            </div>
          )}
        </div>
        <div className="shrink-0" data-testid={`${testId}-source`}>
          <SourceBadge source={view.source} />
        </div>
      </div>
      <RowActions settingKey={key} view={view} label={label} />
    </section>
  );
}
