'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState, type ReactNode } from 'react';

import { type CustomerListItemDto, CustomerStatus } from '@point/shared';
import {
  type CardFields,
  DataTable,
  type DataTableColumn,
  DataText,
  DateText,
  EmptyState,
  ErrorState,
  FilterBar,
  type FilterValue,
  PageHeader,
  Pagination,
  Switch,
  filterFromSearch,
  useGuardedRouter,
} from '@point/ui';

import { CustomerStatusBadge } from '../../../../components/customers/CustomerStatusBadge';
import { useCustomerAccess } from '../../../../lib/customers/access';
import { phoneText } from '../../../../lib/customers/format';
import { useCustomers } from '../../../../lib/customers/queries';
import { screenProblem } from '../../../../lib/pos/problem';
import { MainQueryState, RefusedPage } from '../../../../lib/session/main-query-state';
import { useMe } from '../../../../lib/session/use-me';

// /customers — the customer list (add-customer-management spec "The customer list screen searches and
// filters customers" · AD-CUS-01 · AD-LIST-01 / 02 / 05 / 06 · AD-STATE-01 … 04 · AD-FMT-04 · AD-CMP-05 ·
// design D11 · task 4.4): P3.CUS.01 with the search box ("Name or phone", sent 300 ms after the last key),
// the chips Active / Inactive (none chosen = the API's default, ACTIVE only) and the switch Show archived —
// all kept in the address so Back restores them. From 768 px a table — Name · Phone · Last visit · Visits ·
// Status (the muted badge of an INACTIVE or archived customer; an ACTIVE one has none) — below it one card
// per customer; 25 rows at a time with Previous / Next. *Add customer* only with `customer.create`. There
// is no e-mail column and no merge action (D-CUS-05). Without a customer code the forbidden page. A failed
// first load shows the error state with Retry. The page title is the screen's name (WCAG 2.4.2).

const STATUS_CODES = [CustomerStatus.ACTIVE, CustomerStatus.INACTIVE];
const SEARCH_DELAY_MS = 300;
const NOTHING = '–';

/** A card: name, then the phone, the last visit and the badge when there is one (AD-LIST-02 — 1 to 4). */
function cardFields(name: ReactNode, rest: readonly ReactNode[]): CardFields {
  const [second, third, fourth] = rest;
  if (second === undefined) return [name];
  if (third === undefined) return [name, second];
  if (fourth === undefined) return [name, second, third];
  return [name, second, third, fourth];
}

function NameCell({ customer }: Readonly<{ customer: CustomerListItemDto }>) {
  return (
    <span className="font-semibold" data-testid={`customer-row-${customer.id}`}>
      <DataText>{customer.name}</DataText>
    </span>
  );
}

const lastVisit = (customer: CustomerListItemDto) =>
  customer.last_visit_at === null ? NOTHING : <DateText value={customer.last_visit_at} />;

function CustomerList() {
  const t = useTranslations('customer');
  const router = useGuardedRouter();
  const search = useSearchParams();
  const access = useCustomerAccess();
  const me = useMe().data;
  const switchLabel = useId();
  const [filter, setFilter] = useState<FilterValue>(() => {
    const { q, status } = filterFromSearch(new URLSearchParams(search.toString()));
    return { ...(q === undefined ? {} : { q }), ...(status === undefined ? {} : { status }) };
  });
  const [archived, setArchived] = useState(() => search.get('include_archived') === 'true');
  const [q, setQ] = useState(filter.q ?? '');

  // The request follows the box 300 ms after the last key (design D11).
  useEffect(() => {
    const timer = setTimeout(() => setQ(filter.q ?? ''), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filter.q]);

  // `include_archived` in the address next to the filter bar's own members (AD-LIST-05).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (archived) params.set('include_archived', 'true');
    else params.delete('include_archived');
    const next = params.toString();
    const address = `${window.location.pathname}${next === '' ? '' : `?${next}`}${window.location.hash}`;
    if (address !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', address);
    }
  }, [archived]);

  const list = useCustomers({ q, status: filter.status ?? [], includeArchived: archived });

  const open = (customer: CustomerListItemDto) => router.push(`/customers/${customer.id}`);
  const badge = (customer: CustomerListItemDto) => (
    <CustomerStatusBadge status={customer.status} archived={customer.archived_at !== null} />
  );

  const columns: readonly DataTableColumn<CustomerListItemDto>[] = [
    {
      key: 'name',
      header: t('list.column.name'),
      kind: 'custom',
      render: (customer) => <NameCell customer={customer} />,
    },
    {
      key: 'phone',
      header: t('list.column.phone'),
      kind: 'text',
      value: (customer) => phoneText(customer.phone_normalized),
    },
    {
      key: 'lastVisit',
      header: t('list.column.lastVisit'),
      kind: 'custom',
      render: lastVisit,
    },
    {
      key: 'visits',
      header: t('list.column.visits'),
      kind: 'qty',
      value: (customer) => customer.visit_count,
    },
    { key: 'status', header: t('list.column.status'), kind: 'custom', render: badge },
  ];

  const filtered = q.trim() !== '' || (filter.status ?? []).length > 0 || archived;
  let content;
  if (list.items.length === 0 && list.error !== null) {
    const { code, request_id } = screenProblem(list.error);
    content = (
      <MainQueryState error={list.error}>
        <ErrorState
          problem={{ code, ...(request_id === '' ? {} : { request_id }) }}
          onRetry={list.retry}
        />
      </MainQueryState>
    );
  } else if (!list.loading && list.items.length === 0) {
    content = filtered ? (
      <EmptyState title={t('list.emptySearch')} />
    ) : (
      <EmptyState
        title={t('list.empty')}
        action={{
          label: t('list.add'),
          allowed: access.create,
          onPress: () => router.push('/customers/new'),
        }}
      />
    );
  } else {
    content = (
      <>
        <DataTable
          columns={columns}
          rows={list.items}
          rowKey={(customer) => customer.id}
          card={(customer) => ({
            fields: cardFields(<NameCell key="name" customer={customer} />, [
              <DataText key="phone">{phoneText(customer.phone_normalized)}</DataText>,
              <span key="last">{lastVisit(customer)}</span>,
              ...(customer.status === CustomerStatus.ACTIVE && customer.archived_at === null
                ? []
                : [<span key="status">{badge(customer)}</span>]),
            ]),
          })}
          userId={me?.user.id ?? ''}
          storageKey="customers"
          loading={list.loading}
          onRowPress={open}
        />
        <Pagination list={list} />
      </>
    );
  }

  return (
    <div className="grid w-full gap-6" data-testid="customers-list">
      <title>{t('list.title')}</title>
      <PageHeader
        title={t('list.title')}
        primary={{
          label: t('list.add'),
          allowed: access.create,
          onPress: () => router.push('/customers/new'),
          testId: 'customer-new',
        }}
        filterBar={
          <div className="flex flex-col gap-3">
            <div data-testid="customer-filter-status">
              <FilterBar
                value={filter}
                onChange={setFilter}
                presets={[]}
                search={{ placeholder: t('list.searchPlaceholder') }}
                statuses={{ table: 'customers', codes: STATUS_CODES }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={archived}
                onChange={setArchived}
                aria-labelledby={switchLabel}
                data-testid="customer-filter-archived"
              />
              <span id={switchLabel} className="text-sm">
                {t('list.showArchived')}
              </span>
            </div>
          </div>
        }
      />
      {content}
    </div>
  );
}

/** The page: without a customer code the forbidden page, and no request is made. */
export function CustomersScreen() {
  const access = useCustomerAccess();
  if (!access.any) return <RefusedPage code="forbidden" />;
  return <CustomerList />;
}
