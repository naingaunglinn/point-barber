'use client';

import { cn } from 'cn';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import {
  dateRangeForPreset,
  formatDate,
  STATUS_BY_TABLE,
  todayMmt,
  type StatusTable,
} from '@point/shared';

import { useNow } from '../../providers/clock';
import { useFormat } from '../../providers/format';
import { Button } from '../Button/Button';
import { SearchInput } from '../SearchInput/SearchInput';
import { DateInput } from '../DateInput/DateInput';
import {
  filterFromSearch,
  searchWithFilter,
  type FilterPreset,
  type FilterValue,
} from './filter-address';

// The filters of a list (AD-LIST-01 · AD-LIST-05 · AD-FMT-11 · design D10): a search box whose
// placeholder says what it searches, the date presets on Myanmar business dates — today from the
// supplied clock — with a custom range whose end cannot be before its start, multi-select status chips,
// a removable chip per active filter and "Clear all". The filters are mirrored in the address.

export interface FilterBarProps {
  readonly value: FilterValue;
  readonly onChange: (value: FilterValue) => void;
  /** Translated: what the box searches ("Receipt no."). */
  readonly search?: { readonly placeholder: string };
  readonly presets?: readonly FilterPreset[];
  readonly statuses?: { readonly table: StatusTable; readonly codes: readonly number[] };
  /** Default true: `q`, `from`, `to`, `status` in the address (history.replaceState). */
  readonly syncToUrl?: boolean;
}

export const ALL_PRESETS: readonly FilterPreset[] = [
  'today',
  'yesterday',
  'thisWeek',
  'last7Days',
  'thisMonth',
  'lastMonth',
  'custom',
];

const CHIP =
  'relative inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground';

export { filterFromSearch, searchWithFilter };

export function FilterBar({
  value,
  onChange,
  search,
  presets = ALL_PRESETS,
  statuses,
  syncToUrl = true,
}: FilterBarProps) {
  const t = useTranslations();
  const { locale } = useFormat('FilterBar');
  const now = useNow();

  useEffect(() => {
    if (!syncToUrl) return;
    const next = searchWithFilter(new URLSearchParams(window.location.search), value).toString();
    const address = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`;
    if (address !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', address);
    }
  }, [syncToUrl, value]);

  const statusName = (code: number) => {
    if (statuses === undefined) return String(code);
    const entry = Object.entries(STATUS_BY_TABLE[statuses.table]).find(([, c]) => c === code);
    return (t as unknown as (key: string) => string)(
      `status.${statuses.table}.${entry?.[0] ?? ''}`,
    );
  };

  const choosePreset = (preset: FilterPreset) => {
    if (preset === 'custom') return onChange({ ...value, preset });
    const { from, to } = dateRangeForPreset(preset, todayMmt(now));
    onChange({ ...value, preset, from, to });
  };

  const toggleStatus = (code: number) => {
    const current = value.status ?? [];
    const status = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    onChange({ ...value, status });
  };

  const range =
    value.from === undefined || value.to === undefined
      ? null
      : value.preset !== undefined && value.preset !== 'custom'
        ? t(`common.date.preset.${value.preset}`)
        : `${formatDate(value.from, { locale })} – ${formatDate(value.to, { locale })}`;

  const active: { key: string; label: string; remove: () => void }[] = [
    ...(value.q ? [{ key: 'q', label: value.q, remove: () => onChange({ ...value, q: '' }) }] : []),
    ...(range === null
      ? []
      : [
          {
            key: 'range',
            label: range,
            remove: () => onChange({ ...value, from: undefined, to: undefined, preset: undefined }),
          },
        ]),
    ...(value.status ?? []).map((code) => ({
      key: `status-${code}`,
      label: statusName(code),
      remove: () => toggleStatus(code),
    })),
  ];

  return (
    <div className="flex flex-col gap-3" data-slot="filter-bar">
      {search === undefined ? null : (
        <SearchInput
          value={value.q ?? ''}
          placeholder={search.placeholder}
          onChange={(q) => onChange({ ...value, q })}
        />
      )}
      <div role="group" className="flex flex-wrap gap-2" data-slot="date-presets">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={value.preset === preset}
            className={cn(CHIP, 'border-border')}
            onClick={() => choosePreset(preset)}
          >
            {t(`common.date.preset.${preset}`)}
          </button>
        ))}
      </div>
      {value.preset === 'custom' ? (
        <div className="grid gap-2 md:grid-cols-2">
          <DateInput
            aria-label={t('common.date.preset.custom')}
            value={value.from ?? null}
            max={value.to}
            onChange={(from) => onChange({ ...value, from: from ?? undefined })}
          />
          <DateInput
            aria-label={t('common.date.preset.custom')}
            value={value.to ?? null}
            min={value.from}
            onChange={(to) => onChange({ ...value, to: to ?? undefined })}
          />
        </div>
      ) : null}
      {statuses === undefined ? null : (
        <div role="group" className="flex flex-wrap gap-2" data-slot="status-chips">
          {statuses.codes.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={(value.status ?? []).includes(code)}
              className={cn(CHIP, 'border-border')}
              onClick={() => toggleStatus(code)}
            >
              {statusName(code)}
            </button>
          ))}
        </div>
      )}
      {active.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-2" data-slot="active-filters">
          {active.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={cn(CHIP, 'border-border bg-muted')}
              onClick={chip.remove}
              data-filter={chip.key}
            >
              <span className="sr-only">{t('common.upload.remove')}</span> <span>{chip.label}</span>
              <X aria-hidden className="size-4" />
            </button>
          ))}
          <Button variant="ghost" onClick={() => onChange({})}>
            {t('common.action.clearAll')}
          </Button>
        </div>
      )}
    </div>
  );
}
