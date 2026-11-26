'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { LeaveType, LeaveTypeCreateBody, LeaveTypeUpdateBody } from '@point/shared';

import { api } from '../api/client';

// The Settings › Leave types screen's server state (AD-STATE-01 · AD-RT-02 · add-leave-types design D9):
// the list (P2.LVT.01) is never treated as fresh — loaded again on mount and on window focus (Part 2 §13
// emits no leave-type event). Each write (P2.LVT.02 – 04) invalidates the list; none is optimistic.

export const leaveTypeKeys = {
  all: ['leave-types'] as const,
  list: (includeArchived: boolean) => ['leave-types', { includeArchived }] as const,
};

const LIVE = { staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true } as const;

/**
 * P2.LVT.01 — both statuses; the archived types too when asked (`leave_type.view⁺`). Not loaded for a
 * user the screen refuses (`enabled` false).
 */
export function useLeaveTypes(includeArchived: boolean, enabled = true) {
  return useQuery({
    queryKey: leaveTypeKeys.list(includeArchived),
    queryFn: async () => {
      const archived = includeArchived ? '&include_archived=true' : '';
      return (await api<{ items: LeaveType[] }>(`/leave-types?status=0&status=1${archived}`)).items;
    },
    ...LIVE,
    enabled,
  });
}

function useLeaveTypeWrite<Body>(request: (body: Body) => Promise<LeaveType>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSettled: () => client.invalidateQueries({ queryKey: leaveTypeKeys.all }),
  });
}

/** P2.LVT.02 — a new type, placed last (LT1). */
export function useCreateLeaveType() {
  return useLeaveTypeWrite((body: LeaveTypeCreateBody) =>
    api<LeaveType>('/leave-types', { method: 'POST', body }),
  );
}

/** P2.LVT.03 — the changed members and `expected_updated_at`. */
export function useUpdateLeaveType(id: string) {
  return useLeaveTypeWrite((body: LeaveTypeUpdateBody) =>
    api<LeaveType>(`/leave-types/${id}`, { method: 'PATCH', body }),
  );
}

/** P2.LVT.04 — archive; 409 `leave_type_in_use` while a PENDING leave uses the type. */
export function useArchiveLeaveType(id: string) {
  return useLeaveTypeWrite(() => api<LeaveType>(`/leave-types/${id}/archive`, { method: 'POST' }));
}
