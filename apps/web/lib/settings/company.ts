'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CompanyDto, CompanyUpdate } from '@point/shared';

import { api } from '../api/client';
import { settingsKeys } from './settings.keys';

// The company profile's server state (P1.CO.01 / P1.CO.02 · add-company-profile design D8 · task 4.1): the
// company is never treated as fresh — loaded again on mount and on window focus (the walk-in D11 policy,
// stale time 0) — and the answer of a save is written into the cache. No mutation is optimistic. The
// form keeps the `updated_at` it loaded and sends it as `expected_updated_at` (API-IDEM-04 · CP3).

/** P1.CO.01 — the one company, for every signed-in staff member. */
export function useCompany(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.company,
    queryFn: () => api<CompanyDto>('/company'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
    enabled,
  });
}

/** P1.CO.02 — the changed members and `expected_updated_at`; the answer is the whole company. */
export function useSaveCompany() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CompanyUpdate) => api<CompanyDto>('/company', { method: 'PATCH', body }),
    onSuccess: (company) => client.setQueryData(settingsKeys.company, company),
  });
}
