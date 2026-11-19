'use client';

import {
  columnVisibilityFeature,
  tableFeatures,
  useTable,
  type ColumnVisibilityState,
} from '@tanstack/react-table';
import { cn } from 'cn';
import { ArrowDown, ArrowUp, Columns3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

import { moneyUnit, type BusinessDate, type Instant, type Mmk } from '@point/shared';

import { DESKTOP, TABLET, useMinWidth } from '../../hooks/use-min-width';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu';
import { useFormat } from '../../providers/format';
import { columnsKey, readStored, writeStored } from '../../storage/device-storage';
import { Button } from '../Button/Button';
import { CardList } from '../CardList/CardList';
import { DataText } from '../DataText/DataText';
import { DateText } from '../DateText/DateText';
import { MoneyText } from '../MoneyText/MoneyText';
import { Skeleton } from '../Skeleton/Skeleton';
import { StatusBadge, type StatusBadgeProps } from '../StatusBadge/StatusBadge';
import type { CardSpec } from '../types';

// Lists as a real table from 768 px, as cards below (AD-CMP-07 · AD-LIST-02 · AD-LIST-06 · AD-FMT-01 ·
// AD-A11Y-07 · design D10), on TanStack Table: a sticky header of `<th scope="col">`, rows 48 px high
// (56 px with a touch pointer), money and quantities right-aligned in tabular figures with the unit in
// the header, statuses as badges, a totals row from `totals`, row dividers, sort buttons only where a
// column has a sort key, and a "Columns" menu kept per user on the device. At 768–1023 px at most 7
// columns are visible by default. Sorting is the server's: the table reports `-key` / `key`.

interface ColumnBase {
  readonly key: string;
  readonly header?: string;
  /** The API sort field; only these columns get a sort button. */
  readonly sortKey?: string;
  /** Default true. */
  readonly defaultVisible?: boolean;
}

export type DataTableColumn<T> = ColumnBase &
  (
    | { readonly kind: 'text'; readonly value: (row: T) => string }
    | { readonly kind: 'money'; readonly value: (row: T) => Mmk }
    | { readonly kind: 'qty'; readonly value: (row: T) => number }
    | { readonly kind: 'date'; readonly value: (row: T) => BusinessDate | Instant }
    | { readonly kind: 'time'; readonly value: (row: T) => string }
    | { readonly kind: 'status'; readonly value: (row: T) => StatusBadgeProps }
    | { readonly kind: 'custom'; readonly render: (row: T) => ReactNode }
  );

export interface DataTableProps<T> {
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  /** The row below 768 px. */
  readonly card: (row: T) => CardSpec;
  /** Who the column choice belongs to on this device, and which list it is. */
  readonly userId: string;
  readonly storageKey: string;
  /** Sums from the server, by money column key (the totals row). */
  readonly totals?: Readonly<Record<string, Mmk>>;
  readonly loading?: boolean;
  /** `finished_at` ascending or `-finished_at` descending. */
  readonly sort?: string;
  readonly onSortChange?: (sort: string) => void;
  readonly selectedId?: string;
  readonly onRowPress?: (row: T) => void;
}

/** At 768–1023 px (AD-LIST-06). */
const TABLET_COLUMNS = 7;
const NUMERIC = new Set(['money', 'qty']);
const features = tableFeatures({ columnVisibilityFeature });

function defaultVisibility<T>(
  columns: readonly DataTableColumn<T>[],
  desktop: boolean,
): ColumnVisibilityState {
  let shown = 0;
  return Object.fromEntries(
    columns.map((column) => {
      const visible = column.defaultVisible !== false && (desktop || shown < TABLET_COLUMNS);
      if (visible) shown += 1;
      return [column.key, visible];
    }),
  );
}

const isVisibility = (value: unknown): value is ColumnVisibilityState =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every((visible) => typeof visible === 'boolean');

/** The next sort of a column: descending first, then ascending, then descending again. */
export function nextSort(current: string | undefined, sortKey: string): string {
  return current === `-${sortKey}` ? sortKey : `-${sortKey}`;
}

export function DataTable<T extends object>(props: DataTableProps<T>) {
  const { columns, rows, rowKey, card, userId, storageKey, totals, loading = false, sort } = props;
  const { onSortChange, selectedId, onRowPress } = props;
  const t = useTranslations('common');
  const { locale, profile } = useFormat('DataTable');
  const tablet = useMinWidth(TABLET);
  const desktop = useMinWidth(DESKTOP);
  const key = columnsKey(storageKey, userId);
  const [stored, setStored] = useState<ColumnVisibilityState | undefined>(undefined);

  useEffect(() => setStored(readStored(key, isVisibility)), [key]);

  const columnVisibility = useMemo(
    () => ({ ...defaultVisibility(columns, desktop), ...stored }),
    [columns, desktop, stored],
  );
  const definitions = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );
  const tableColumns = useMemo(
    () => columns.map((column) => ({ id: column.key, accessorFn: (row: T) => row })),
    [columns],
  );
  const data = useMemo(() => [...rows], [rows]);
  const table = useTable({
    features,
    columns: tableColumns,
    data,
    getRowId: (row: T) => rowKey(row),
    state: { columnVisibility },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater;
      writeStored(key, next);
      setStored(next);
    },
  });

  if (!tablet) {
    return (
      <CardList rows={rows} rowKey={rowKey} card={card} loading={loading} onRowPress={onRowPress} />
    );
  }

  const headerOf = (column: DataTableColumn<T>) =>
    column.header ??
    (column.kind === 'money'
      ? t('amountHeader', { unit: moneyUnit(locale, profile) })
      : column.key);

  const cellOf = (column: DataTableColumn<T>, row: T): ReactNode => {
    switch (column.kind) {
      case 'text':
        return <DataText>{column.value(row)}</DataText>;
      case 'money':
        return <MoneyText amount={column.value(row)} unit={false} />;
      case 'qty':
        return String(column.value(row));
      case 'date':
        return <DateText value={column.value(row)} />;
      case 'time':
        return <DateText value={column.value(row)} mode="time" />;
      case 'status':
        return <StatusBadge {...column.value(row)} />;
      case 'custom':
        return column.render(row);
    }
  };

  const visibleColumns = table
    .getVisibleLeafColumns()
    .map((column) => definitions.get(column.id))
    .filter((column): column is DataTableColumn<T> => column !== undefined);

  return (
    <div className="flex flex-col gap-2" data-slot="data-table">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" icon={<Columns3 />}>
              {t('action.columns')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table.getAllLeafColumns().map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
                onSelect={(event) => event.preventDefault()}
                className="min-h-11 text-base"
              >
                {headerOf(definitions.get(column.id) as DataTableColumn<T>)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="relative max-h-[70dvh] overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border">
              {visibleColumns.map((column) => {
                const active =
                  column.sortKey !== undefined &&
                  (sort === column.sortKey || sort === `-${column.sortKey}`);
                const descending = sort === `-${column.sortKey}`;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (descending ? 'descending' : 'ascending') : undefined}
                    className={cn(
                      'h-12 px-3 text-start font-semibold',
                      NUMERIC.has(column.kind) && 'text-end',
                    )}
                  >
                    {column.sortKey === undefined ? (
                      headerOf(column)
                    ) : (
                      <button
                        type="button"
                        className="relative inline-flex min-h-11 items-center gap-1 font-semibold"
                        onClick={() => onSortChange?.(nextSort(sort, column.sortKey as string))}
                      >
                        {headerOf(column)}
                        {active ? (
                          descending ? (
                            <ArrowDown aria-hidden className="size-4" />
                          ) : (
                            <ArrowUp aria-hidden className="size-4" />
                          )
                        ) : null}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={visibleColumns.length} className="p-2">
                  <Skeleton shape="row" count={5} />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const pressable = onRowPress !== undefined;
                return (
                  <tr
                    key={row.id}
                    aria-selected={selectedId === undefined ? undefined : row.id === selectedId}
                    tabIndex={pressable ? 0 : undefined}
                    onClick={pressable ? () => onRowPress(row.original as T) : undefined}
                    onKeyDown={
                      pressable
                        ? (event: KeyboardEvent) => {
                            if (event.key === 'Enter' || event.key === ' ')
                              onRowPress(row.original);
                          }
                        : undefined
                    }
                    className={cn(
                      'h-12 border-b border-border pointer-coarse:h-14',
                      pressable && 'cursor-pointer hover:bg-muted',
                      row.id === selectedId && 'bg-accent',
                    )}
                  >
                    {visibleColumns.map((column) => (
                      <td
                        key={column.key}
                        className={cn('px-3', NUMERIC.has(column.kind) && 'text-end font-numeric')}
                      >
                        {cellOf(column, row.original as T)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
          {totals === undefined || loading ? null : (
            <tfoot>
              <tr className="h-12 border-t-2 border-border font-semibold" data-slot="totals">
                {visibleColumns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-3', NUMERIC.has(column.kind) && 'text-end font-numeric')}
                  >
                    {column.kind === 'money' && totals[column.key] !== undefined ? (
                      <MoneyText amount={totals[column.key] as Mmk} unit={false} />
                    ) : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
