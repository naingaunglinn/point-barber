'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { BookingStatus, localized, SaleStatus, type CursorPage, type Instant } from '@point/shared';

import { CardList } from '../../components/CardList/CardList';
import { DataTable, type DataTableColumn } from '../../components/DataTable/DataTable';
import { FilterBar } from '../../components/FilterBar/FilterBar';
import { filterFromSearch, type FilterValue } from '../../components/FilterBar/filter-address';
import { FormField } from '../../components/FormField/FormField';
import { MoneyText } from '../../components/MoneyText/MoneyText';
import { Pagination } from '../../components/Pagination/Pagination';
import { usePagedList, type PageSize } from '../../components/Pagination/use-paged-list';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge';
import { TextInput } from '../../components/TextInput/TextInput';
import type { CardSpec } from '../../components/types';
import { useFormat } from '../../providers/format';
import { useCataloguePersona } from '../catalogue-providers';
import { DemoToggle, HandlerLog } from '../demo-frame';
import { CUSTOMERS, DEMO_SALES, DEMO_SALES_TOTAL, PAGING_ROWS, type DemoSale } from '../fixtures';

// List demos (task 9.6 · AD-CMP-07 · AD-LIST-01..06 · API-DATA-08 · design D12): the "Sales" list of the
// brief (table from 768 px, cards below, filters in the address, totals, per-user columns), a 9-column
// table for the tablet limit, and the 56-row paged list with a fake cursor endpoint. Nothing is fetched.

/** Demo finish times of the four B3 sales on 05/Oct/2026 (the third is the receipt of spec-fixtures §5). */
const FINISHED_AT: readonly Instant[] = [
  '2026-10-05T09:31:00+06:30',
  '2026-10-05T10:05:00+06:30',
  '2026-10-05T10:42:00+06:30',
  '2026-10-05T11:20:00+06:30',
];

interface SaleRow extends DemoSale {
  readonly finished_at: Instant;
}

const ROWS: readonly SaleRow[] = DEMO_SALES.map((sale, index) => ({
  ...sale,
  finished_at: FINISHED_AT[index] ?? FINISHED_AT[0] ?? '2026-10-05T09:31:00+06:30',
}));

function useSaleColumns(): {
  readonly columns: readonly DataTableColumn<SaleRow>[];
  readonly card: (row: SaleRow) => CardSpec;
} {
  const t = useTranslations('devui.lists');
  const { locale } = useFormat('DataTable demo');
  const barber = (row: SaleRow) => localized(row.barber, 'name', locale);
  const services = (row: SaleRow) =>
    row.services.map((service) => localized(service, 'name', locale)).join(' + ');
  return {
    columns: [
      { key: 'receipt', header: t('receiptNo'), kind: 'text', value: (row) => row.receiptNo },
      {
        key: 'finished_at',
        header: t('finishedOn'),
        kind: 'time',
        sortKey: 'finished_at',
        value: (row) => row.finished_at,
      },
      { key: 'barber', header: t('barber'), kind: 'text', value: barber },
      { key: 'services', header: t('services'), kind: 'text', value: services },
      { key: 'amount', kind: 'money', value: (row) => row.amount },
      {
        key: 'status',
        header: t('status'),
        kind: 'status',
        value: () => ({ table: 'sales', code: SaleStatus.FINISHED }),
      },
    ],
    card: (row) => ({
      fields: [
        row.receiptNo,
        barber(row),
        <MoneyText key="amount" amount={row.amount} />,
        <StatusBadge key="status" table="sales" code={SaleStatus.FINISHED} />,
      ],
    }),
  };
}

export function SalesListDemo() {
  const t = useTranslations('devui.lists');
  const log = useTranslations('devui.log');
  const persona = useCataloguePersona();
  const { columns, card } = useSaleColumns();
  const [filter, setFilter] = useState<FilterValue>({});
  const [sort, setSort] = useState<string | undefined>(undefined);
  const rows = ROWS.filter(
    (row) =>
      (filter.q === undefined || row.receiptNo.toLowerCase().includes(filter.q.toLowerCase())) &&
      (filter.status === undefined ||
        filter.status.length === 0 ||
        filter.status.includes(SaleStatus.FINISHED)) &&
      (filter.from === undefined || row.finished_at.slice(0, 10) >= filter.from) &&
      (filter.to === undefined || row.finished_at.slice(0, 10) <= filter.to),
  );
  return (
    <div className="flex flex-col gap-3">
      <FilterBar
        value={filter}
        onChange={setFilter}
        search={{ placeholder: t('searchReceipt') }}
        statuses={{ table: 'sales', codes: Object.values(SaleStatus) }}
        // The bookings demo owns the address (`q`, `from`, `to`, `status`); this one keeps its filter local.
        syncToUrl={false}
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.receiptNo}
        card={card}
        userId={persona}
        storageKey="demo-sales"
        totals={{ amount: DEMO_SALES_TOTAL }}
        sort={sort}
        onSortChange={setSort}
      />
      <HandlerLog label={log('label')} value={sort === undefined ? '' : log('sort', { sort })} />
    </div>
  );
}

/** Nine columns: at 768–1023 px only the first 7 are shown by default (AD-LIST-06). */
export function NineColumnsDemo() {
  const t = useTranslations('devui.lists');
  const persona = useCataloguePersona();
  const { columns, card } = useSaleColumns();
  const extra: readonly DataTableColumn<SaleRow>[] = [
    { key: 'customer', header: t('customer'), kind: 'text', value: () => CUSTOMERS.maSu.name },
    { key: 'method', header: t('method'), kind: 'text', value: () => t('cash') },
    {
      key: 'lines',
      header: t('lines'),
      kind: 'qty',
      value: (row) => row.services.length,
    },
  ];
  const all = [...columns.slice(0, 4), ...extra, ...columns.slice(4)];
  return (
    <DataTable
      columns={all}
      rows={ROWS}
      rowKey={(row) => row.receiptNo}
      card={card}
      userId={persona}
      storageKey="demo-sales-nine"
      totals={{ amount: DEMO_SALES_TOTAL }}
    />
  );
}

export function CardListDemo() {
  const { card } = useSaleColumns();
  return <CardList rows={ROWS} rowKey={(row) => row.receiptNo} card={card} />;
}

export function FilterBarDemo() {
  const t = useTranslations('devui.lists');
  const log = useTranslations('devui.log');
  const params = useSearchParams();
  // The filter starts from the address, so a reload keeps it (AD-LIST-01).
  const [filter, setFilter] = useState<FilterValue>(() =>
    filterFromSearch(new URLSearchParams(params.toString())),
  );
  return (
    <div className="flex flex-col gap-2">
      <FilterBar
        value={filter}
        onChange={setFilter}
        search={{ placeholder: t('searchBooking') }}
        statuses={{ table: 'bookings', codes: Object.values(BookingStatus) }}
      />
      <HandlerLog label={log('reported')} value={JSON.stringify(filter)} />
    </div>
  );
}

/** The fake cursor endpoint: the cursor is the offset; `total` can be withheld. */
function pageOf(
  rows: readonly { readonly position: number }[],
  limit: PageSize,
  cursor: string | null,
  withTotal: boolean,
): CursorPage<{ readonly position: number }> {
  const start = cursor === null ? 0 : Number(cursor);
  const end = start + limit;
  return {
    items: rows.slice(start, end),
    next_cursor: end < rows.length ? String(end) : null,
    total: withTotal ? rows.length : null,
  };
}

export function PagingDemo() {
  const t = useTranslations('devui.lists');
  const [withTotal, setWithTotal] = useState(true);
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState<string[]>([]);
  const rows = useMemo(
    () =>
      PAGING_ROWS.filter((row) => search === '' || String(row.position).includes(search.trim())),
    [search],
  );
  const list = usePagedList({
    fetchPage: async ({ limit, cursor }) => {
      setRequests((previous) => [...previous.slice(-2), `limit=${limit} cursor=${cursor ?? '∅'}`]);
      return pageOf(rows, limit, cursor, withTotal);
    },
    resetKey: `${search}|${withTotal}`,
  });
  return (
    <div className="flex flex-col gap-3">
      <DemoToggle
        label={t('withholdTotal')}
        checked={!withTotal}
        onChange={(off) => setWithTotal(!off)}
      />
      <div className="max-w-xs">
        <FormField label={t('searchRows')}>
          {(control) => <TextInput {...control} value={search} onChange={setSearch} />}
        </FormField>
      </div>
      <ol className="grid grid-cols-5 gap-1 text-sm" data-testid="paged-rows">
        {list.items.map((row) => (
          <li key={row.position}>{t('row', { n: row.position })}</li>
        ))}
      </ol>
      <Pagination list={list} />
      <HandlerLog label={t('requests')} value={requests.join(' · ')} />
    </div>
  );
}
