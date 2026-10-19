'use client';

import { useQuery } from '@tanstack/react-query';

import type { MeResponse } from '@point/shared';

import { api } from '../api/client';

// The session layer's one source of who is signed in (API-AUTH-05 · AD-PERM-03 · AD-STATE-04 · design
// D17): `GET /v1/me` under the key `['me']`, loaded again whenever the window gets focus and never
// treated as fresh, never persisted — a changed role or scope reaches the open app on focus, without a
// new sign-in (D-ROLE-06).
export const ME_QUERY_KEY = ['me'] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api<MeResponse>('/me'),
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });
}
