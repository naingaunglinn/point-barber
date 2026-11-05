'use client';

import { useTranslations } from 'next-intl';

import { type SettingKey, formatDateTime } from '@point/shared';
import { Button, Drawer, ErrorState, Skeleton, useFormat } from '@point/ui';

import { screenProblem } from '../../../lib/pos/problem';
import { useSettingHistory } from '../../../lib/settings/queries';
import { type Translate, formatSettingValue } from './setting-values';

// The history of one value (AD-SET-03 "who, when, old → new" · P1.SET.05 · API-DATA-08 · design D10 ·
// task 5.10): the company value, or one branch's override, newest first — "U Kyaw Zin · 05/Oct/2026 9:05
// AM · 30 min → 15 min", values formatted by type and `—` for none — 25 lines a page and "Load more" for
// the next. Loaded only while the drawer is open.

export function HistoryDrawer({
  settingKey,
  label,
  branchId,
  open,
  onOpenChange,
}: Readonly<{
  settingKey: SettingKey;
  /** Translated name of the setting, shown above the lines. */
  label: string;
  branchId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useTranslations('settings');
  const tAny = useTranslations() as unknown as Translate;
  const format = useFormat('HistoryDrawer');
  const history = useSettingHistory(settingKey, branchId, open);
  const lines = history.data?.pages.flatMap((page) => page.items) ?? [];
  const value = (raw: unknown) => formatSettingValue(settingKey, raw, { t: tAny, ...format });
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={t('action.history')}>
      <div className="flex flex-col gap-3" data-testid={`setting-${settingKey}-history`}>
        <p className="font-semibold">{label}</p>
        {history.isError ? (
          <ErrorState problem={screenProblem(history.error)} onRetry={() => history.refetch()} />
        ) : history.data === undefined ? (
          <div aria-busy="true">
            <Skeleton shape="text" />
          </div>
        ) : lines.length === 0 ? (
          <p className="text-muted-foreground" data-testid="setting-history-empty">
            {t('history.empty')}
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {lines.map((line) => (
              <li key={line.id} className="py-2 break-words" data-testid="setting-history-line">
                {t('history.line', {
                  name:
                    format.locale === 'en'
                      ? (line.changed_by.name_en ?? line.changed_by.name_mm)
                      : line.changed_by.name_mm,
                  datetime: formatDateTime(line.changed_at, { locale: format.locale }),
                  old: value(line.old_value),
                  new: value(line.new_value),
                })}
              </li>
            ))}
          </ol>
        )}
        {history.hasNextPage ? (
          <div>
            <Button
              loading={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
              data-testid="setting-history-more"
            >
              {t('action.load_more')}
            </Button>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
