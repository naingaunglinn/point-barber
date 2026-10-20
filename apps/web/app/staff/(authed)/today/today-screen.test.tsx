// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IDS, saleOf, visitOf } from '../../../../test/pos-fixtures';
import { renderPos, routeFetch } from '../../../../test/pos-render';
import { json, problem } from '../../../../test/render';

// add-walkin-visit-checkout tasks 10.3 / 10.4 — visits spec "Today lists the barber's open visits first"
// on the screen: the date line, the open visits from `GET /v1/me/visits?status=1&status=2` oldest first,
// a card's action opens its sale, the empty state's ＋ Start, the error state with Retry.
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/today',
  useSearchParams: () => new URLSearchParams(),
}));
const { TodayScreen } = await import('./today-screen');

const OPEN = 'GET /api/v1/me/visits?status=1&status=2';
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const B = '0199a3f2-0000-7000-8005-000000000002';
const SALE_B = '0199a3f2-0000-7000-8006-000000000002';

describe('Today (P4.VIS.02)', () => {
  it('Scenario: Two open visits, oldest first — the date line, the cards, a card opens its sale', async () => {
    const a = visitOf({ started_at: '2026-10-05T09:20:00+06:30' });
    const b = visitOf({
      id: B,
      status: 2,
      started_at: '2026-10-05T09:40:00+06:30',
      completed_at: '2026-10-05T10:00:00+06:30',
      sale: saleOf({ id: SALE_B, visit_id: B }),
    });
    routeFetch(fetchMock, { [OPEN]: json(200, { items: [a, b] }) });
    renderPos(<TodayScreen />);
    expect(screen.getByText('Mon, 05/Oct/2026')).toBeTruthy();
    const cards = await screen.findAllByRole('listitem');
    expect(cards).toHaveLength(2);
    fireEvent.click(within(cards[1] as HTMLElement).getByRole('button', { name: 'Take payment' }));
    expect(push).toHaveBeenCalledWith(`/sales/${SALE_B}`);
    fireEvent.click(within(cards[0] as HTMLElement).getByRole('button', { name: 'Service done' }));
    expect(push).toHaveBeenLastCalledWith(`/sales/${IDS.SALE}`);
  });

  it('Scenario: No open visit — the empty state; ＋ Start opens the arrival step', async () => {
    routeFetch(fetchMock, { [OPEN]: json(200, { items: [] }) });
    renderPos(<TodayScreen />);
    expect(await screen.findByText('No customer in progress')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(push).toHaveBeenCalledWith('/visits/new');
  });

  it('Scenario: The list fails to load — the error state with the error ID; Retry loads again', async () => {
    let calls = 0;
    routeFetch(fetchMock, {
      [OPEN]: () => {
        calls += 1;
        return calls === 1
          ? json(500, problem(500, 'internal_error'))
          : json(200, { items: [visitOf()] });
      },
    });
    renderPos(<TodayScreen />);
    expect(await screen.findByText(/0199a3f2/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
  });
});
