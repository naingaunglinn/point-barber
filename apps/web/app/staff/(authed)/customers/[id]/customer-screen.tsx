'use client';

import { useTranslations } from 'next-intl';

import type { CustomerDto } from '@point/shared';
import {
  DataText,
  ErrorState,
  LockBanner,
  PageHeader,
  Skeleton,
  TABLET,
  useMinWidth,
  useNow,
} from '@point/ui';

import { CustomerOverview } from '../../../../../components/customers/CustomerOverview';
import { CustomerStatusBadge } from '../../../../../components/customers/CustomerStatusBadge';
import { useCustomerAccess } from '../../../../../lib/customers/access';
import { phoneText } from '../../../../../lib/customers/format';
import { useCustomer } from '../../../../../lib/customers/queries';
import { screenProblem } from '../../../../../lib/pos/problem';
import { MainQueryState, RefusedPage } from '../../../../../lib/session/main-query-state';

// /customers/[id] — a customer (add-customer-management spec "The customer page shows the profile, the
// statistics and the history" · AD-CUS-02 · AD-DET-01 · AD-DET-02 · AD-VIS-12 · AD-STATE-01 … 04 · design
// D11 · task 4.6): a full page whose header shows the name (no avatar — a Myanmar name has no initials), the
// grouped phone — a `tel:` link below 768 px — and the muted badge of an INACTIVE or archived customer; an
// archived customer also shows the banner. Overview shows the notes and the five statistics. This part
// ends there: the History tab, the Edit sheet and the status actions are the next part (tasks 4.7 – 4.9).
// Without a customer code the forbidden page; an unknown id is the API's 404. A failed first load shows
// the error state with Retry; a failed load in the background (window focus) keeps the customer shown.

function Phone({ customer }: Readonly<{ customer: CustomerDto }>) {
  const t = useTranslations('customer');
  const wide = useMinWidth(TABLET);
  const text = phoneText(customer.phone_normalized);
  if (wide) return <DataText>{text}</DataText>;
  return (
    <a
      href={`tel:${customer.phone_normalized}`}
      className="font-semibold text-primary underline"
      aria-label={`${t('detail.call')} ${text}`}
    >
      {text}
    </a>
  );
}

function Detail({ customer }: Readonly<{ customer: CustomerDto }>) {
  const t = useTranslations('customer');
  // The statistics are computed on every read, so the tile's "updated" time is the app's clock now.
  const now = useNow();
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6" data-testid="customer-header">
      <title>{customer.name}</title>
      <PageHeader
        title={customer.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Phone customer={customer} />
            <CustomerStatusBadge
              status={customer.status}
              archived={customer.archived_at !== null}
              data-testid="customer-status-badge"
            />
          </span>
        }
      />
      {customer.archived_at === null ? null : (
        <LockBanner message={t('detail.archivedBanner')} />
      )}
      <CustomerOverview customer={customer} updatedAt={now.toISOString()} />
    </div>
  );
}

function CustomerPage({ id }: Readonly<{ id: string }>) {
  const customer = useCustomer(id);
  if (customer.data === undefined && customer.isError) {
    const { code, request_id } = screenProblem(customer.error);
    return (
      <MainQueryState error={customer.error}>
        <ErrorState
          problem={{ code, ...(request_id === '' ? {} : { request_id }) }}
          onRetry={() => customer.refetch()}
        />
      </MainQueryState>
    );
  }
  if (customer.data === undefined) {
    return (
      <div aria-busy="true" data-testid="customer-loading">
        <Skeleton shape="row" count={6} />
      </div>
    );
  }
  return <Detail customer={customer.data} />;
}

/** The page: without a customer code the forbidden page, and no request is made. */
export function CustomerScreen({ id }: Readonly<{ id: string }>) {
  const access = useCustomerAccess();
  if (!access.any) return <RefusedPage code="forbidden" />;
  return <CustomerPage id={id} />;
}
