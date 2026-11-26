'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CancelReason,
  CancelReasonCreate,
  CancelReasonOrder,
  CancelReasonUpdate,
} from '@point/shared';

import { api } from '../api/client';

// The Settings › Cancel reasons screen's server state (AD-STATE-01 · AD-RT-02 · add-booking-cancel-reasons
// design D9): the list (P3.CRS.01) is never treated as fresh — loaded again on mount and on window focus
// (Part 3 §8 defines no realtime event for it). Each write (P3.CRS.02 – 05) invalidates the list; none
// is optimistic.

export const cancelReasonKeys = {
  all: ['cancel-reasons'] as const,
  list: (includeArchived: boolean) => ['cancel-reasons', { includeArchived }] as const,
};

const LIVE = { staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true } as const;

/**
 * P3.CRS.01 — both statuses; the archived reasons too when asked (`booking_cancel_reason.view⁺`). Not
 * loaded for a user the screen refuses (`enabled` false).
 */
export function useCancelReasons(includeArchived: boolean, enabled = true) {
  return useQuery({
    queryKey: cancelReasonKeys.list(includeArchived),
    queryFn: async () => {
      const archived = includeArchived ? '&include_archived=true' : '';
      return (
        await api<{ items: CancelReason[] }>(`/booking-cancel-reasons?status=0&status=1${archived}`)
      ).items;
    },
    ...LIVE,
    enabled,
  });
}

function useCancelReasonWrite<Body, Answer>(request: (body: Body) => Promise<Answer>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSettled: () => client.invalidateQueries({ queryKey: cancelReasonKeys.all }),
  });
}

/** P3.CRS.02 — a new reason, placed last (CR1). */
export function useCreateCancelReason() {
  return useCancelReasonWrite((body: CancelReasonCreate) =>
    api<CancelReason>('/booking-cancel-reasons', { method: 'POST', body }),
  );
}

/** P3.CRS.03 — the changed members and `expected_updated_at`. */
export function useUpdateCancelReason(id: string) {
  return useCancelReasonWrite((body: CancelReasonUpdate) =>
    api<CancelReason>(`/booking-cancel-reasons/${id}`, { method: 'PATCH', body }),
  );
}

/** P3.CRS.04 — archive; 409 `system_row` for the no-show row (the screen offers no Archive there). */
export function useArchiveCancelReason() {
  return useCancelReasonWrite((id: string) =>
    api<CancelReason>(`/booking-cancel-reasons/${id}/archive`, { method: 'POST' }),
  );
}

/** P3.CRS.05 — every non-archived id in the new order. */
export function useReorderCancelReasons() {
  return useCancelReasonWrite((ids: readonly string[]) => {
    const body: CancelReasonOrder = { ids: [...ids] };
    return api<{ items: CancelReason[] }>('/booking-cancel-reasons/order', {
      method: 'PUT',
      body,
    });
  });
}
