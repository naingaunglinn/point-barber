'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type {
  CustomerArchiveBody,
  CustomerCreateBody,
  CustomerDto,
  CustomerListItemDto,
  CustomerStatusBody,
  CustomerUpdateBody,
  CursorPage,
  TimelineEntryDto,
} from '@point/shared';
import { type PagedList, type PageSize, usePagedList } from '@point/ui';

import { api } from '../api/client';
import { customerKeys } from './customers.keys';

// The customer screens' server state (AD-STATE-01 · AD-STATE-04 · AD-RT-02 · add-customer-management design
// D11): no customer event exists (Part 3 §8), so the detail and the timeline are never treated as fresh —
// loaded again on mount and on window focus — and the list is loaded again whenever it opens. Each write
// (P3.CUS.03 / 05 – 08) puts the customer it returns into the cache and invalidates the list, every detail
// and every timeline. No write is optimistic (CG-UI-08).

const LIVE = { staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true } as const;

/** The filters of the list as the API takes them (P3.CUS.01). */
export interface CustomerListFilter {
  readonly q: string;
  /** Empty = the API's default, ACTIVE only (owner #7). */
  readonly status: readonly number[];
  readonly includeArchived: boolean;
}

function listPath(filter: CustomerListFilter, limit: PageSize, cursor: string | null): string {
  const query = new URLSearchParams();
  if (filter.q.trim() !== '') query.set('q', filter.q.trim());
  for (const code of filter.status) query.append('status', String(code));
  if (filter.includeArchived) query.set('include_archived', 'true');
  query.set('limit', String(limit));
  if (cursor !== null) query.set('cursor', cursor);
  return `/customers?${query.toString()}`;
}

/**
 * P3.CUS.01 — a page of customers, 25 at a time, with Previous / Next on `next_cursor`; a changed filter
 * starts again from the first page. `retry` loads the page again after a failed load.
 */
export function useCustomers(filter: CustomerListFilter): PagedList<CustomerListItemDto> & {
  readonly retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([filter.q.trim(), filter.status, filter.includeArchived, attempt]);
  const list = usePagedList<CustomerListItemDto>({
    fetchPage: ({ limit, cursor }) =>
      api<CursorPage<CustomerListItemDto>>(listPath(filter, limit, cursor)),
    resetKey: key,
  });
  return { ...list, retry: () => setAttempt((value) => value + 1) };
}

/** P3.CUS.04 — one customer; a refusal (403 / 404) is the page's state, so it is not retried. */
export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => api<CustomerDto>(`/customers/${id}`),
    ...LIVE,
    retry: false,
  });
}

/** P3.CUS.09 — the customer's bookings, visits and sales, newest first, from `cursor`. */
export function useCustomerTimeline(id: string, cursor: string | null = null) {
  return useQuery({
    queryKey: [...customerKeys.timeline(id), cursor] as const,
    queryFn: () =>
      api<CursorPage<TimelineEntryDto>>(
        `/customers/${id}/timeline?limit=25${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
      ),
    ...LIVE,
    retry: false,
  });
}

function useCustomerWrite<Body>(request: (body: Body) => Promise<CustomerDto>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: async (customer) => {
      client.setQueryData(customerKeys.detail(customer.id), customer);
      await client.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

/** P3.CUS.03 — add a customer. */
export function useCreateCustomer() {
  return useCustomerWrite((body: CustomerCreateBody) =>
    api<CustomerDto>('/customers', { method: 'POST', body }),
  );
}

/** P3.CUS.05 — the changed members of a customer and `expected_updated_at`. */
export function useUpdateCustomer(id: string) {
  return useCustomerWrite((body: CustomerUpdateBody) =>
    api<CustomerDto>(`/customers/${id}`, { method: 'PATCH', body }),
  );
}

/** P3.CUS.06 — Inactive (0) or Active (1). */
export function useSetCustomerStatus(id: string) {
  return useCustomerWrite((body: CustomerStatusBody) =>
    api<CustomerDto>(`/customers/${id}/status`, { method: 'POST', body }),
  );
}

/** P3.CUS.07 — archive, with the optional note. */
export function useArchiveCustomer(id: string) {
  return useCustomerWrite((body: CustomerArchiveBody) =>
    api<CustomerDto>(`/customers/${id}/archive`, { method: 'POST', body }),
  );
}

/** P3.CUS.08 — restore an archived customer as ACTIVE; the add form restores the holder of a taken phone. */
export function useRestoreCustomer() {
  return useCustomerWrite((id: string) =>
    api<CustomerDto>(`/customers/${id}/restore`, { method: 'POST' }),
  );
}
