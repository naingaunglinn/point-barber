'use client';

import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type {
  MaintenanceBody,
  SettingHistoryPage,
  SettingKey,
  SettingList,
  SettingView,
  SystemStatus,
} from '@point/shared';

import { api } from '../api/client';
import { ME_QUERY_KEY } from '../session/use-me';
import { settingsKeys } from './settings.keys';

// The server state of Additional settings and Maintenance mode (P1.SET.01 – 05 · P1.SYS.02 / 03 ·
// add-settings-store design D10 · task 5.3): the company view and one view per covered branch, the
// history pages of one value, and the maintenance status. Nothing is treated as fresh (stale time 0 —
// the walk-in D11 policy) and no mutation is optimistic: a save shows its result once the server has
// answered, and it invalidates every settings query and `/me` (whose `settings` block it changes).

const SETTINGS = '/settings';

/** P1.SET.01 — every key with the company values and, for `branchId`, that branch's values. */
export function useSettings(branchId?: string, enabled = true) {
  return useQuery({
    queryKey: settingsKeys.list(branchId),
    queryFn: () =>
      api<SettingList>(
        branchId === undefined ? SETTINGS : `${SETTINGS}?branch_id=${encodeURIComponent(branchId)}`,
      ),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
    enabled,
  });
}

/** P1.SET.05 — the history of the company value, or of one branch's override; 25 per page. */
export function useSettingHistory(key: SettingKey, branchId: string | undefined, enabled = true) {
  return useInfiniteQuery({
    queryKey: settingsKeys.history(key, branchId),
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      if (branchId !== undefined) query.set('branch_id', branchId);
      if (pageParam !== null) query.set('cursor', pageParam);
      const search = query.toString();
      return api<SettingHistoryPage>(
        `${SETTINGS}/${encodeURIComponent(key)}/history${search === '' ? '' : `?${search}`}`,
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
    staleTime: 0,
    retry: false,
    enabled,
  });
}

export type SettingHistoryPages = InfiniteData<SettingHistoryPage, string | null>;

/** After a write: every settings query and `/me` load again. */
function useAfterWrite() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: settingsKeys.all }),
      client.invalidateQueries({ queryKey: ME_QUERY_KEY }),
    ]);
  };
}

export interface SaveSetting {
  readonly key: SettingKey;
  readonly value: unknown;
  /** A branch override; absent = the company value. */
  readonly branchId?: string;
}

/** P1.SET.03 — set a company value or a branch override; the answer is its SettingView. */
export function useSaveSetting() {
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: ({ key, value, branchId }: SaveSetting) =>
      api<SettingView>(`${SETTINGS}/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: branchId === undefined ? { value } : { value, branch_id: branchId },
      }),
    onSuccess: afterWrite,
  });
}

export interface ResetSetting {
  readonly key: SettingKey;
  readonly branchId?: string;
}

/** P1.SET.04 — a branch back to the company value, or the company value back to the default. */
export function useResetSetting() {
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: ({ key, branchId }: ResetSetting) =>
      api<SettingView>(`${SETTINGS}/${encodeURIComponent(key)}/reset`, {
        method: 'POST',
        body: branchId === undefined ? {} : { branch_id: branchId },
      }),
    onSuccess: afterWrite,
  });
}

/** P1.SYS.02 — the maintenance flag, the expected end and the messages. */
export function useSystemStatus(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.systemStatus,
    queryFn: () => api<SystemStatus>('/system/status'),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
    enabled,
  });
}

/** P1.SYS.03 — maintenance on / off; the answer is the system status. */
export function useSetMaintenance() {
  const client = useQueryClient();
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: (body: MaintenanceBody) =>
      api<SystemStatus>('/system/maintenance', { method: 'PUT', body }),
    onSuccess: async (status) => {
      client.setQueryData(settingsKeys.systemStatus, status);
      await afterWrite();
    },
  });
}
