'use client';

import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CursorPage,
  CustomerLookupDto,
  PaymentMethodDto,
  QuoteDto,
  QuoteItemDto,
  ReceiptViewDto,
  RequestLookupDto,
  SaleDto,
  ServiceCategoryDto,
  ServiceListItemDto,
  VisitDto,
} from '@point/shared';

import { ApiProblem, api } from '../api/client';

// The walk-in's server state (add-walkin-visit-checkout design D11 · AD-PERF-03 / 04 · ADR-008): open
// visits and a sale are never treated as fresh — loaded again on mount, on window focus and on
// reconnect, with no polling — and every mutation writes the Visit / Sale it returns into the cache and
// invalidates the open visits. Catalogue lists stay 5 minutes. No mutation is optimistic.

export const OPEN_VISITS_KEY = ['me', 'visits', 'open'] as const;
export const saleKey = (id: string) => ['sale', id] as const;
export const visitKey = (id: string) => ['visit', id] as const;

const LIVE = {
  staleTime: 0,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;
const CATALOGUE = { staleTime: 5 * 60_000, refetchOnWindowFocus: true } as const;

/** P4.VIS.02 — the caller's open visits (STARTED and COMPLETED, any date), oldest first. */
export function useOpenVisits() {
  return useQuery({
    queryKey: OPEN_VISITS_KEY,
    queryFn: async () => (await api<{ items: VisitDto[] }>('/me/visits?status=1&status=2')).items,
    ...LIVE,
  });
}

/** P4.SAL.02 — one sale. */
export function useSale(id: string) {
  return useQuery({
    queryKey: saleKey(id),
    queryFn: () => api<SaleDto>(`/sales/${id}`),
    ...LIVE,
    retry: false,
  });
}

/** P4.VIS.04 — the visit of a sale (header, state); waits for the sale's `visit_id`. */
export function useVisit(id: string | null | undefined) {
  return useQuery({
    queryKey: visitKey(id ?? ''),
    queryFn: () => api<VisitDto>(`/visits/${id}`),
    enabled: id !== null && id !== undefined,
    ...LIVE,
    retry: false,
  });
}

/** P2.SVC.01 — the simple services sold at the branch, catalogue order (START chips, picker). */
export function useServices(branchId: string | undefined) {
  return useQuery({
    queryKey: ['services', branchId, 'simple'],
    queryFn: async () =>
      (
        await api<CursorPage<ServiceListItemDto>>(
          `/services?branch_id=${branchId}&pricing_mode=1&limit=100`,
        )
      ).items,
    enabled: branchId !== undefined,
    ...CATALOGUE,
  });
}

/** P2.CAT.01 — the ACTIVE categories in `sort_order`. */
export function useCategories() {
  return useQuery({
    queryKey: ['service-categories'],
    queryFn: async () => (await api<{ items: ServiceCategoryDto[] }>('/service-categories')).items,
    ...CATALOGUE,
  });
}

/** P4.PMT.01 — the ACTIVE payment methods, Cash first. */
export function usePaymentMethods() {
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => (await api<{ items: PaymentMethodDto[] }>('/payment-methods')).items,
    ...CATALOGUE,
  });
}

/** P2.PRC.06 accepts at most 20 items per quote. */
const QUOTE_ITEMS_MAX = 20;

/**
 * P2.PRC.06 — the prices the picker shows: this branch, this performer, the visit's business date
 * (today on the START sheet), so a row shows the price the line will record (P4-RULE-05). Not cached.
 */
export function useQuote(input: {
  readonly branchId: string | undefined;
  readonly employeeId: string | undefined;
  readonly date: string | undefined;
  readonly serviceIds: readonly string[] | undefined;
}) {
  const { branchId, employeeId, date, serviceIds } = input;
  return useQuery({
    queryKey: ['quote', branchId, employeeId, date, serviceIds],
    queryFn: async () => {
      const ids = serviceIds ?? [];
      const items: QuoteItemDto[] = [];
      for (let at = 0; at < ids.length; at += QUOTE_ITEMS_MAX) {
        const quote = await api<QuoteDto>('/prices/quote', {
          method: 'POST',
          body: {
            branch_id: branchId,
            location_type: 1,
            date,
            employee_id: employeeId,
            items: ids.slice(at, at + QUOTE_ITEMS_MAX).map((service_id) => ({ service_id })),
          },
        });
        items.push(...quote.items);
      }
      return items;
    },
    enabled:
      branchId !== undefined &&
      employeeId !== undefined &&
      date !== undefined &&
      serviceIds !== undefined &&
      serviceIds.length > 0,
    staleTime: 0,
  });
}

/** P4.RCP.01 `format=json` — the on-screen receipt of a FINISHED sale. */
export function useReceipt(saleId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['receipt', saleId],
    queryFn: () => api<ReceiptViewDto>(`/sales/${saleId}/receipt?format=json`),
    enabled,
    staleTime: 0,
  });
}

/** P4.REQ.01 — what was saved under a key; null when nothing was (404). */
export async function lookupRequest(key: string): Promise<RequestLookupDto | null> {
  try {
    return await api<RequestLookupDto>(`/me/requests/${key}`);
  } catch (error) {
    if (error instanceof ApiProblem && error.status === 404) return null;
    throw error;
  }
}

/** P3.CUS.02 — the phone lookup of the Finish step. */
export function lookupCustomer(
  phone: string,
): Promise<{ customer: CustomerLookupDto | null; archived?: true }> {
  return api(`/customers/lookup?phone=${encodeURIComponent(phone)}`);
}

/** After a mutation: the returned sale (and its visit) into the cache; the open visits reload. */
export function storeSale(client: QueryClient, sale: SaleDto): void {
  client.setQueryData(saleKey(sale.id), sale);
  void client.invalidateQueries({ queryKey: OPEN_VISITS_KEY });
  if (sale.visit_id !== null) void client.invalidateQueries({ queryKey: visitKey(sale.visit_id) });
}

export function storeVisit(client: QueryClient, visit: VisitDto): void {
  client.setQueryData(visitKey(visit.id), visit);
  client.setQueryData(saleKey(visit.sale.id), visit.sale);
  void client.invalidateQueries({ queryKey: OPEN_VISITS_KEY });
}

/** The cache writers bound to the app's query client. */
export function useStore() {
  const client = useQueryClient();
  return {
    sale: (sale: SaleDto) => storeSale(client, sale),
    visit: (visit: VisitDto) => storeVisit(client, visit),
    reloadSale: (id: string) => client.invalidateQueries({ queryKey: saleKey(id) }),
  };
}
