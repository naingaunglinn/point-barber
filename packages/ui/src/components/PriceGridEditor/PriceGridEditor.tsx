'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';

import {
  formatDuration,
  formatMoney,
  localized,
  nextBusinessDate,
  normalizeDigits,
  todayMmt,
  type BusinessDate,
  type Mmk,
} from '@point/shared';

import { Input } from '../../primitives/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../primitives/tabs';
import { useNow } from '../../providers/clock';
import { useFormat } from '../../providers/format';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu';
import { Button } from '../Button/Button';
import { DateInput } from '../DateInput/DateInput';
import { DataText } from '../DataText/DataText';
import { FormField } from '../FormField/FormField';
import { MoneyInput } from '../MoneyInput/MoneyInput';
import { MoneyText } from '../MoneyText/MoneyText';
import { bilingualText, type OptionGroup } from '../OptionPicker/OptionPicker';

// The price grid of a service (AD-CMP-13 · D-SVC-05 · D-SVC-06 · D-SVC-08 · design D10): at most two
// option groups as rows and columns, tabs for the branch and for Shop / Home, a price (MoneyInput) and a
// duration in each cell. On the Shop tab an empty price means "not sold here" and shows `—` — 0 is a
// valid price; on the Home tab an empty price uses the shop price, shown as the placeholder. "Change
// prices from" defaults to tomorrow's Myanmar date (D-SVC-08); "Copy from branch…" copies a whole grid.
// Read-only: the cells are text. The current / scheduled view and the history belong to the change
// that first edits prices.

export interface PriceCell {
  /** One value id per group, in group order; empty for a simple service. */
  readonly valueIds: readonly string[];
  readonly price_amount: Mmk | null;
  readonly duration_minutes: number | null;
}

/** Zero, one or two option groups (AD-CMP-13): a third does not compile. */
export type PriceGridGroups =
  readonly [] | readonly [OptionGroup] | readonly [OptionGroup, OptionGroup];

export interface GridBranch {
  readonly id: string;
  readonly code: string;
  readonly name_mm: string;
  readonly name_en: string | null;
}

export type GridLocation = 'shop' | 'home';

const LOCATIONS: readonly GridLocation[] = ['shop', 'home'];

export interface PriceGridEditorProps {
  readonly mode: 'simple' | 'options';
  readonly groups: PriceGridGroups;
  readonly branches: readonly GridBranch[];
  readonly branchId: string;
  readonly location: GridLocation;
  readonly cells: readonly PriceCell[];
  readonly defaultDurationMinutes: number;
  /** Default: tomorrow in Myanmar Time, from the supplied clock. */
  readonly effectiveFrom?: BusinessDate;
  /** The Shop prices of the same branch, for the Home placeholders. */
  readonly shopCells?: readonly PriceCell[];
  readonly readOnly?: boolean;
  readonly onChange: (cells: readonly PriceCell[]) => void;
  readonly onBranchChange?: (branchId: string) => void;
  readonly onLocationChange?: (location: GridLocation) => void;
  readonly onEffectiveFromChange?: (date: BusinessDate | null) => void;
  readonly onCopyFromBranch?: (branchId: string) => void;
}

const keyOf = (valueIds: readonly string[]) => valueIds.join('|');
const DASH = '—';

export function PriceGridEditor(props: PriceGridEditorProps) {
  const { mode, groups, branches, branchId, location, cells, defaultDurationMinutes } = props;
  const { shopCells = [], readOnly = false, onChange } = props;
  const t = useTranslations('common.grid');
  const words = useTranslations('common.format');
  const { locale, profile } = useFormat('PriceGridEditor');
  const notSoldId = useId();
  const gridId = useId();
  const tomorrow = nextBusinessDate(todayMmt(useNow()));
  const effectiveFrom = props.effectiveFrom ?? tomorrow;

  const byKey = new Map(cells.map((cell) => [keyOf(cell.valueIds), cell]));
  const shopByKey = new Map(shopCells.map((cell) => [keyOf(cell.valueIds), cell]));
  const [rowGroup, columnGroup] = mode === 'simple' ? [undefined, undefined] : groups;
  const rows = rowGroup?.values ?? [undefined];
  const columns = columnGroup?.values ?? [undefined];

  const update = (valueIds: readonly string[], change: Partial<PriceCell>) => {
    const key = keyOf(valueIds);
    const current = byKey.get(key) ?? { valueIds, price_amount: null, duration_minutes: null };
    const next = { ...current, ...change };
    onChange(
      byKey.has(key)
        ? cells.map((cell) => (keyOf(cell.valueIds) === key ? next : cell))
        : [...cells, next],
    );
  };

  const nameOf = (
    value: { readonly name: { readonly mm: string; readonly en: string | null } } | undefined,
  ) => (value === undefined ? '' : bilingualText(value.name, locale));

  // A cell's fields are labelled by the visible row and column headers (AD-A11Y-04); the duration
  // field also by its visible unit.
  const headerId = (kind: 'row' | 'column', value: { readonly id: string } | undefined) =>
    value === undefined ? undefined : `${gridId}-${kind}-${value.id}`;

  const cell = (row: (typeof rows)[number], column: (typeof columns)[number]): ReactNode => {
    const valueIds = [row?.id, column?.id].filter((id): id is string => id !== undefined);
    const headers = [headerId('row', row), headerId('column', column)].filter(Boolean).join(' ');
    const minutesId = `${gridId}-minutes-${valueIds.join('-') || 'single'}`;
    const current = byKey.get(keyOf(valueIds));
    const shopPrice = shopByKey.get(keyOf(valueIds))?.price_amount ?? null;
    const label = [nameOf(row), nameOf(column)].filter(Boolean).join(' · ');
    const empty =
      location === 'home' && shopPrice !== null
        ? t('usesShopPrice', { price: formatMoney(shopPrice, { locale, profile }) })
        : DASH;
    const notSold = location === 'shop' && (current?.price_amount ?? null) === null;
    if (readOnly) {
      return (
        <div className="flex flex-col items-end gap-0.5" data-slot="price-cell">
          {current?.price_amount === null || current === undefined ? (
            <span className="text-muted-foreground" title={notSold ? t('notSold') : undefined}>
              {empty}
            </span>
          ) : (
            <MoneyText amount={current.price_amount} />
          )}
          <span className="text-xs text-muted-foreground">
            {formatDuration(current?.duration_minutes ?? defaultDurationMinutes, { locale })}
          </span>
        </div>
      );
    }
    return (
      <div
        className="flex min-w-36 flex-col gap-2"
        data-slot="price-cell"
        data-cell={keyOf(valueIds)}
      >
        <MoneyInput
          {...(headers === ''
            ? { 'aria-label': label === '' ? t(location === 'home' ? 'home' : 'shop') : label }
            : { 'aria-labelledby': headers })}
          value={current?.price_amount ?? null}
          placeholder={empty}
          title={notSold ? t('notSold') : undefined}
          aria-describedby={notSold ? notSoldId : undefined}
          lakhHelper={false}
          onChange={(price) => update(valueIds, { price_amount: price })}
        />
        <div className="relative flex items-center">
          <Input
            type="text"
            inputMode="numeric"
            aria-labelledby={headers === '' ? minutesId : `${headers} ${minutesId}`}
            placeholder={String(defaultDurationMinutes)}
            value={
              current?.duration_minutes === null || current === undefined
                ? ''
                : String(current.duration_minutes)
            }
            onChange={(event) => {
              const digits = normalizeDigits(event.target.value).replace(/\D/g, '');
              update(valueIds, { duration_minutes: digits === '' ? null : Number(digits) });
            }}
            className="h-12 pe-14 text-end font-numeric text-base md:h-10"
          />
          <span id={minutesId} className="pointer-events-none absolute end-3 text-muted-foreground">
            {words('min')}
          </span>
        </div>
      </div>
    );
  };

  // The grid of the chosen branch and location.
  const editor = (
    <>
      {readOnly ? null : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48">
            <FormField label={t('changeFrom')}>
              {(control) => (
                <DateInput
                  {...control}
                  value={effectiveFrom}
                  min={tomorrow}
                  onChange={(date) => props.onEffectiveFromChange?.(date)}
                />
              )}
            </FormField>
          </div>
          {props.onCopyFromBranch === undefined ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" icon={<Copy />}>
                  {t('copyFromBranch')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {branches
                  .filter((branch) => branch.id !== branchId)
                  .map((branch) => (
                    <DropdownMenuItem
                      key={branch.id}
                      className="min-h-11 text-base"
                      onSelect={() => props.onCopyFromBranch?.(branch.id)}
                    >
                      <DataText>{localized(branch, 'name', locale)}</DataText>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          {columnGroup === undefined ? null : (
            <thead>
              <tr>
                <td />
                {columns.map((column) => (
                  <th
                    key={column?.id}
                    id={headerId('column', column)}
                    scope="col"
                    className="px-2 pb-2 text-start font-semibold"
                  >
                    <DataText>{nameOf(column)}</DataText>
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row) => (
              <tr key={row?.id ?? 'simple'} className="border-t border-border">
                {rowGroup === undefined ? null : (
                  <th
                    id={headerId('row', row)}
                    scope="row"
                    className="py-2 pe-3 text-start font-semibold"
                  >
                    <DataText>{nameOf(row)}</DataText>
                  </th>
                )}
                {columns.map((column) => (
                  <td key={column?.id ?? 'single'} className="px-2 py-2 align-top">
                    {cell(row, column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  // Branch and location are two sets of tabs over the one grid: each trigger controls its own panel,
  // and only the panel of the chosen branch and location holds the grid (WAI-ARIA tabs — every
  // `aria-controls` names a panel that exists).
  return (
    <div className="flex flex-col gap-4" data-slot="price-grid">
      <span id={notSoldId} hidden>
        {t('notSold')}
      </span>
      <Tabs value={branchId} onValueChange={(id) => props.onBranchChange?.(id)} className="gap-4">
        <TabsList>
          {branches.map((branch) => (
            <TabsTrigger key={branch.id} value={branch.id}>
              <DataText>{localized(branch, 'name', locale)}</DataText>
            </TabsTrigger>
          ))}
        </TabsList>
        {branches.map((branch) => (
          <TabsContent key={branch.id} value={branch.id} className="text-base">
            <Tabs
              value={location}
              onValueChange={(value) => props.onLocationChange?.(value as GridLocation)}
              className="gap-4"
            >
              <TabsList>
                <TabsTrigger value="shop">{t('shop')}</TabsTrigger>
                <TabsTrigger value="home">{t('home')}</TabsTrigger>
              </TabsList>
              {LOCATIONS.map((value) => (
                <TabsContent key={value} value={value} className="flex flex-col gap-4 text-base">
                  {editor}
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
