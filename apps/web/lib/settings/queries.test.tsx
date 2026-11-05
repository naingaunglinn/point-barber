// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IDS } from '../../test/pos-fixtures';
import { routeFetch } from '../../test/pos-render';
import { json } from '../../test/render';
import { ME_QUERY_KEY } from '../session/use-me';
import {
  useResetSetting,
  useSaveSetting,
  useSetMaintenance,
  useSettingHistory,
  useSettings,
} from './queries';
import { settingsKeys } from './settings.keys';

// add-settings-store task 5.3 — the settings queries and mutations (P1.SET.01 – 05 · P1.SYS.03 · design
// D10): the company view and a branch's view under their own keys, the history pages by cursor, and a
// write that sends the right body and loads every settings query and `/me` again.
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const bodyOf = (init: RequestInit | undefined): unknown => JSON.parse(String(init?.body));

describe('settings queries (task 5.3)', () => {
  it('the company view and a branch view are two queries with their own address', async () => {
    routeFetch(fetchMock, {
      'GET /api/v1/settings': json(200, { items: [] }),
      [`GET /api/v1/settings?branch_id=${IDS.B3}`]: json(200, { items: [] }),
    });
    const { client, wrapper } = harness();
    const company = renderHook(() => useSettings(), { wrapper });
    const b3 = renderHook(() => useSettings(IDS.B3), { wrapper });
    await waitFor(() => expect(company.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(b3.result.current.isSuccess).toBe(true));
    expect(client.getQueryData(settingsKeys.list(undefined))).toStrictEqual({ items: [] });
    expect(client.getQueryData(settingsKeys.list(IDS.B3))).toStrictEqual({ items: [] });
  });

  it('the history loads page after page by cursor, and stops at next_cursor null', async () => {
    const path = `/api/v1/settings/home_service.transport_fee_amount/history?branch_id=${IDS.B3}`;
    routeFetch(fetchMock, {
      [`GET ${path}`]: json(200, { items: [{ id: 'a' }], next_cursor: 'CURSOR' }),
      [`GET ${path}&cursor=CURSOR`]: json(200, { items: [{ id: 'b' }], next_cursor: null }),
    });
    const { wrapper } = harness();
    const { result } = renderHook(
      () => useSettingHistory('home_service.transport_fee_amount', IDS.B3),
      { wrapper },
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('a save sends { value, branch_id } and loads the settings and /me again', async () => {
    routeFetch(fetchMock, {
      'PUT /api/v1/settings/home_service.transport_fee_amount': (init) =>
        json(200, { key: 'home_service.transport_fee_amount', body: bodyOf(init) }),
    });
    const { client, wrapper } = harness();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSaveSetting(), { wrapper });
    let answer: unknown;
    await act(async () => {
      answer = await result.current.mutateAsync({
        key: 'home_service.transport_fee_amount',
        value: 3000,
        branchId: IDS.B3,
      });
    });
    expect(answer).toMatchObject({ body: { value: 3000, branch_id: IDS.B3 } });
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toStrictEqual([
      settingsKeys.all,
      ME_QUERY_KEY,
    ]);
  });

  it('a company save sends no branch_id; a reset posts {} or { branch_id }', async () => {
    const bodies: unknown[] = [];
    routeFetch(fetchMock, {
      'PUT /api/v1/settings/booking.slot_interval_minutes': (init) => {
        bodies.push(bodyOf(init));
        return json(200, {});
      },
      'POST /api/v1/settings/booking.slot_interval_minutes/reset': (init) => {
        bodies.push(bodyOf(init));
        return json(200, {});
      },
      'POST /api/v1/settings/receipt.printer_width_mm/reset': (init) => {
        bodies.push(bodyOf(init));
        return json(200, {});
      },
    });
    const { wrapper } = harness();
    const save = renderHook(() => useSaveSetting(), { wrapper });
    const reset = renderHook(() => useResetSetting(), { wrapper });
    await act(() =>
      save.result.current.mutateAsync({ key: 'booking.slot_interval_minutes', value: 30 }),
    );
    await act(() => reset.result.current.mutateAsync({ key: 'booking.slot_interval_minutes' }));
    await act(() =>
      reset.result.current.mutateAsync({ key: 'receipt.printer_width_mm', branchId: IDS.B3 }),
    );
    expect(bodies).toStrictEqual([{ value: 30 }, {}, { branch_id: IDS.B3 }]);
  });

  it('maintenance: the answer is the status, written into its query', async () => {
    const status = {
      maintenance: true,
      until: null,
      message_mm: null,
      message_en: 'Server update',
      version: '0.1.0',
      server_time: '2026-10-05T21:00:00+06:30',
    };
    routeFetch(fetchMock, { 'PUT /api/v1/system/maintenance': json(200, status) });
    const { client, wrapper } = harness();
    const { result } = renderHook(() => useSetMaintenance(), { wrapper });
    await act(() => result.current.mutateAsync({ enabled: true, message_en: 'Server update' }));
    expect(client.getQueryData(settingsKeys.systemStatus)).toStrictEqual(status);
  });
});
