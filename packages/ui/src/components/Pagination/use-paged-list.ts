'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { CursorPage } from '@point/shared';

// Cursor paging of a list (AD-LIST-05 · API-DATA-08 · API-LIM-03 · design D10): 25 rows by default,
// 50 or 100 on request, never more; "Previous" walks back a stack of the cursors already visited;
// the total only when the server gives it; back to the first page when the filters change.

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export interface PagedListOptions<T> {
  readonly fetchPage: (request: {
    readonly limit: PageSize;
    readonly cursor: string | null;
  }) => Promise<CursorPage<T>>;
  readonly limit?: PageSize;
  /** Changes when the filters change (for example the serialised filter value): page 1 again. */
  readonly resetKey?: string;
}

export interface PagedList<T> {
  readonly items: readonly T[];
  readonly total: number | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly pageIndex: number;
  readonly limit: PageSize;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
  readonly next: () => void;
  readonly previous: () => void;
  readonly setLimit: (limit: PageSize) => void;
}

export function usePagedList<T>({
  fetchPage,
  limit: initialLimit = 25,
  resetKey = '',
}: PagedListOptions<T>): PagedList<T> {
  const [limit, setLimitState] = useState<PageSize>(initialLimit);
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null]);
  const [page, setPage] = useState<CursorPage<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const fetcher = useRef(fetchPage);
  fetcher.current = fetchPage;
  const pageIndex = cursors.length - 1;
  const cursor = cursors[pageIndex] ?? null;

  // A filter change starts again from the first page.
  const lastReset = useRef(resetKey);
  useEffect(() => {
    if (lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    setCursors([null]);
  }, [resetKey]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    fetcher.current({ limit, cursor }).then(
      (result) => {
        if (!current) return; // an answer for a page the user already left
        setPage(result);
        setLoading(false);
      },
      (failure: unknown) => {
        if (!current) return;
        setError(failure);
        setLoading(false);
      },
    );
    return () => {
      current = false;
    };
  }, [limit, cursor, resetKey]);

  const next = useCallback(() => {
    const following = page?.next_cursor;
    if (following === null || following === undefined) return;
    setCursors((stack) => [...stack, following]);
  }, [page]);

  const previous = useCallback(
    () => setCursors((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack)),
    [],
  );

  const setLimit = useCallback((size: PageSize) => {
    setLimitState(size);
    setCursors([null]);
  }, []);

  return {
    items: page?.items ?? [],
    total: page?.total ?? null,
    loading,
    error,
    pageIndex,
    limit,
    hasNext: !loading && page?.next_cursor !== null && page?.next_cursor !== undefined,
    hasPrevious: pageIndex > 0,
    next,
    previous,
    setLimit,
  };
}
