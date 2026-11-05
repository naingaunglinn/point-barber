import { useMutation, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createQueryClient, QueryProvider } from './query';

// AD-PERF-03 (refetch on focus) · AD-NET-02 (no automatic retry of a mutation) · design D1.
/** A key factory, as each module has one (CG-UI-07). */
const saleKeys = { list: () => ['sales'] as const };

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryProvider>{children}</QueryProvider>
);

describe('QueryProvider', () => {
  it('refetches a list when the window gets focus again', () => {
    expect(createQueryClient().getDefaultOptions().queries?.refetchOnWindowFocus).toBe(true);
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(0);
  });

  it('never retries a failed mutation', async () => {
    const send = vi.fn(() => Promise.reject(new Error('network')));
    const { result } = renderHook(() => useMutation({ mutationFn: send }), { wrapper });
    await act(async () => {
      await result.current.mutateAsync().catch(() => {});
    });
    expect(send).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('gives each mounted provider its own client', async () => {
    const fetchList = vi.fn(() => Promise.resolve(['B3-2026-OCT-00001']));
    const { result } = renderHook(
      () => useQuery({ queryKey: saleKeys.list(), queryFn: fetchList }),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.data).toEqual(['B3-2026-OCT-00001']));
    expect(fetchList).toHaveBeenCalledTimes(1);
  });
});
