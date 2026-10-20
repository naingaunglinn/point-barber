// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IDS, saleOf, serviceOf, visitOf } from '../../../../../test/pos-fixtures';
import { renderPos, routeFetch } from '../../../../../test/pos-render';
import { json, problem } from '../../../../../test/render';

// add-walkin-visit-checkout tasks 10.5 – 10.9 — visits spec "START records a walk-in …", "START is
// idempotent on its Idempotency-Key", "A completed, unpaid visit blocks the performer's next START" and
// "Was it saved?" on the screen: Walk-in → the sheet (branch, me, chips) → Start sends one POST with a key
// and opens the sale; a double tap sends one request; the unpaid link opens that sale; no answer for
// 15 s → the key is looked up.
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/visits/new',
  useSearchParams: () => new URLSearchParams(),
}));
const { NewVisitScreen } = await import('./new-visit-screen');

const SERVICES = `GET /api/v1/services?branch_id=${IDS.B3}&pricing_mode=1&limit=100`;
const START = 'POST /api/v1/visits';
const services = json(200, {
  items: [serviceOf(IDS.HAIRCUT, 'Haircut', 1), serviceOf(IDS.SHAVE, 'Shave', 2)],
  next_cursor: null,
  total: null,
});
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const starts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
const keyOf = (call: Parameters<typeof fetch>) =>
  (call[1]?.headers as Record<string, string>)['Idempotency-Key'];

async function openSheet() {
  renderPos(<NewVisitScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Walk-in' }));
  await screen.findByRole('button', { name: 'Haircut' });
}

describe('START (P4.VIS.03)', () => {
  it('Scenario: First service chosen on the START sheet — one POST with a key, the sale opens', async () => {
    routeFetch(fetchMock, { [SERVICES]: services, [START]: json(201, visitOf()) });
    await openSheet();
    expect(screen.getByTestId('start-branch').textContent).toBe('Point 3.0');
    fireEvent.click(screen.getByRole('button', { name: 'Haircut' }));
    fireEvent.click(screen.getByTestId('start-submit'));
    fireEvent.click(screen.getByTestId('start-submit'));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sales/${IDS.SALE}`));
    expect(starts()).toHaveLength(1);
    const [call] = starts();
    expect(keyOf(call as Parameters<typeof fetch>)).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(call?.[1]?.body))).toStrictEqual({
      branch_id: IDS.B3,
      items: [{ service_id: IDS.HAIRCUT }],
    });
  });

  it('Scenario: Awaiting payment blocks the next customer — the message and the link to that sale', async () => {
    const waiting = '0199a3f2-0000-7000-8005-000000000009';
    const waitingSale = '0199a3f2-0000-7000-8006-000000000009';
    routeFetch(fetchMock, {
      [SERVICES]: services,
      [START]: json(422, problem(422, 'unpaid_visit_open', { context: { visit_id: waiting } })),
      [`GET /api/v1/visits/${waiting}`]: json(
        200,
        visitOf({ id: waiting, status: 2, sale: saleOf({ id: waitingSale, visit_id: waiting }) }),
      ),
    });
    await openSheet();
    fireEvent.click(screen.getByTestId('start-submit'));
    expect((await screen.findByTestId('start-unpaid')).textContent).toContain(
      'Finish payment for your previous customer first',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open the previous customer' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sales/${waitingSale}`));
  });

  it('Scenario: Lost reply, then the lookup — "Checking whether it was saved…", then the visit opens', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let key = '';
    routeFetch(fetchMock, {
      [SERVICES]: services,
      [START]: (init) => {
        key = (init?.headers as Record<string, string>)['Idempotency-Key'] ?? '';
        return new Promise<Response>(() => undefined);
      },
    });
    await openSheet();
    fireEvent.click(screen.getByTestId('start-submit'));
    routeFetch(fetchMock, {
      [SERVICES]: services,
      [`GET /api/v1/me/requests/${key}`]: json(200, {
        client_request_id: key,
        resource_type: 'visit',
        id: IDS.VISIT,
        sale_id: IDS.SALE,
        visit_id: null,
      }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sales/${IDS.SALE}`));
  });

  it('nothing saved — "It wasn\'t saved" and Retry sends the same key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const keys: string[] = [];
    routeFetch(fetchMock, {
      [SERVICES]: services,
      [START]: (init) => {
        keys.push((init?.headers as Record<string, string>)['Idempotency-Key'] ?? '');
        return keys.length === 1 ? new Promise<Response>(() => undefined) : json(201, visitOf());
      },
    });
    await openSheet();
    fireEvent.click(screen.getByTestId('start-submit'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(await screen.findByTestId('saved-not-saved')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sales/${IDS.SALE}`));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
});
