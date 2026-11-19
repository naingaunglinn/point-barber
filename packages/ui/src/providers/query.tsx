'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

// Server state of the web app (AD-PERF-03 · AD-NET-02 · design D1): a list refetches when the window
// gets focus again, and a mutation is never retried by the client — a money action is repeated only
// by the user, with the same Idempotency-Key (AD-NET-01).
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: true },
      mutations: { retry: 0 },
    },
  });
}

export function QueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
