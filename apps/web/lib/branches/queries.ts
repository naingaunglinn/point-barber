'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  Branch,
  BranchCreateBody,
  BranchStatusBody,
  BranchSummary,
  BranchUpdateBody,
} from '@point/shared';

import { api } from '../api/client';
import { branchKeys } from './branches.keys';

// The branch screens' server state (AD-STATE-01 · AD-RT-02 · add-branch-management design D9): the list
// (P1.BR.01) and a branch (P1.BR.03) are never treated as fresh — loaded again on mount and on window
// focus (Part 1 emits no branch event). Each write (P1.BR.02 / 04 / 05) puts the branch it returns into
// the cache and invalidates the list and every detail. No write is optimistic (CG-UI-08).

const LIVE = { staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true } as const;

/** P1.BR.01 — every branch of the company. */
export function useBranches() {
  return useQuery({
    queryKey: branchKeys.list,
    queryFn: async () => (await api<{ items: BranchSummary[] }>('/branches')).items,
    ...LIVE,
  });
}

/** P1.BR.03 — one branch; a refusal (403 / 404) is the page's state, so it is not retried. */
export function useBranch(id: string) {
  return useQuery({
    queryKey: branchKeys.detail(id),
    queryFn: () => api<Branch>(`/branches/${id}`),
    ...LIVE,
    retry: false,
  });
}

function useBranchWrite<Body>(request: (body: Body) => Promise<Branch>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: async (branch) => {
      client.setQueryData(branchKeys.detail(branch.id), branch);
      await client.invalidateQueries({ queryKey: branchKeys.all });
    },
  });
}

/** P1.BR.02 — create a branch. */
export function useCreateBranch() {
  return useBranchWrite((body: BranchCreateBody) =>
    api<Branch>('/branches', { method: 'POST', body }),
  );
}

/** P1.BR.04 — the changed members of a branch and `expected_updated_at`. */
export function useUpdateBranch(id: string) {
  return useBranchWrite((body: BranchUpdateBody) =>
    api<Branch>(`/branches/${id}`, { method: 'PATCH', body }),
  );
}

/** P1.BR.05 — deactivate (0) or re-activate (1), with the optional reason. */
export function useSetBranchStatus(id: string) {
  return useBranchWrite((body: BranchStatusBody) =>
    api<Branch>(`/branches/${id}/status`, { method: 'POST', body }),
  );
}
