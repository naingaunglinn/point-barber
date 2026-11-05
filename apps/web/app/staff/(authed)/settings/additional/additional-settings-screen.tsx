'use client';

import { useTranslations } from 'next-intl';

import type { SettingView } from '@point/shared';
import { ErrorState, PageHeader, Skeleton } from '@point/ui';

import { SettingRow } from '../../../../../components/settings/additional/SettingRow';
import { screenProblem } from '../../../../../lib/pos/problem';
import { useCan } from '../../../../../lib/session/grants';
import { RefusedPage } from '../../../../../lib/session/main-query-state';
import { useSettings } from '../../../../../lib/settings/queries';

// Settings › Additional settings (AD-SET-01 · AD-STATE-01 – 03 · AD-PERM-02 · design D10 · task 5.4): the
// company values of every key, grouped by module in the order Booking, Sales & payments, Closing,
// Dashboard, System — the order of settings.json — each row with its control or its value as text. A user
// without any `settings.*` code gets the no-access page and no value is loaded. A failed first load shows
// the error state; a failed load in the background (window focus) keeps the rows already shown, so what
// was typed into them stays. The page title is the screen's name (WCAG 2.4.2 · AD-A11Y-01).

type Module = 'booking' | 'sales' | 'closing' | 'dashboard' | 'system';

/** The rows by module, in the order the list gives them (settings.json order). */
function groupsOf(items: readonly SettingView[]): { module: Module; items: SettingView[] }[] {
  const groups: { module: Module; items: SettingView[] }[] = [];
  for (const item of items) {
    const module = item.definition.module as Module;
    const last = groups.at(-1);
    if (last?.module === module) last.items.push(item);
    else groups.push({ module, items: [item] });
  }
  return groups;
}

export function AdditionalSettingsScreen() {
  const t = useTranslations('settings');
  const can = useCan();
  const allowed = can('settings.view') || can('settings.update');
  const list = useSettings(undefined, allowed);
  if (!allowed) return <RefusedPage code="forbidden" />;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4" data-testid="additional-settings">
      <title>{t('nav.additional')}</title>
      <PageHeader title={t('nav.additional')} />
      {list.data === undefined ? (
        list.isError ? (
          <ErrorState problem={screenProblem(list.error)} onRetry={() => list.refetch()} />
        ) : (
          <div aria-busy="true" className="grid gap-3" data-testid="additional-settings-loading">
            <Skeleton shape="text" />
            <Skeleton shape="text" />
            <Skeleton shape="text" />
          </div>
        )
      ) : (
        groupsOf(list.data.items).map((group) => (
          <section
            key={group.module}
            aria-labelledby={`settings-group-${group.module}`}
            className="rounded-md border border-border px-4"
            data-testid={`settings-group-${group.module}`}
          >
            <h2 id={`settings-group-${group.module}`} className="pt-4 text-lg font-semibold">
              {t(`group.${group.module}`)}
            </h2>
            {group.items.map((view) => (
              <SettingRow key={view.key} view={view} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
