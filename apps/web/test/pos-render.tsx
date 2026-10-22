import { QueryClient } from '@tanstack/react-query';
import type { RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

import type { Locale } from '@point/i18n';
import type { MeResponse } from '@point/shared';

import { BranchProvider, startBranchOf } from '../lib/session/branch';
import { ME_QUERY_KEY } from '../lib/session/use-me';
import { IDS, meOf } from './pos-fixtures';
import { json, renderStaff } from './render';

// add-walkin-visit-checkout — a POS screen as the signed-in area frames it: `/me` already in the cache,
// the branch context of the chip, and a fetch answered by route (`'POST /api/v1/visits'`). An unrouted
// call answers 404, so a test sees every request the screen makes.

export type Route =
  Response | ((init: RequestInit | undefined, url: string) => Response | Promise<Response>);

export function routeFetch(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  routes: Record<string, Route>,
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    const route = routes[`${init?.method ?? 'GET'} ${url}`];
    if (route === undefined) return json(404, { code: 'not_found', request_id: '' });
    return typeof route === 'function' ? route(init, url) : route.clone();
  });
}

export function renderPos(
  ui: ReactElement,
  {
    me = meOf(),
    branchId = IDS.B3,
    locale = 'en',
  }: { readonly me?: MeResponse; readonly branchId?: string; readonly locale?: Locale } = {},
): RenderResult & { readonly client: QueryClient } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(ME_QUERY_KEY, me);
  return renderStaff(
    <BranchProvider
      value={{ branchId, setBranchId: () => undefined, startBranch: startBranchOf(me, branchId) }}
    >
      {ui}
    </BranchProvider>,
    { client, locale },
  );
}
