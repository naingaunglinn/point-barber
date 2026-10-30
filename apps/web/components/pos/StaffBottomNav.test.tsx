// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { visitOf } from '../../test/pos-fixtures';
import { renderPos, routeFetch } from '../../test/pos-render';
import { json } from '../../test/render';

// add-walkin-visit-checkout tasks 10.1 / 10.4 — the bottom navigation: Today with the number of open
// visits as its badge (none when nothing is open), the centre ＋ Start and More (owner 28/Oct/2026).
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/today',
  useSearchParams: () => new URLSearchParams(),
}));
const { StaffBottomNav } = await import('./StaffBottomNav');

const OPEN = 'GET /api/v1/me/visits?status=1&status=2';
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('StaffBottomNav', () => {
  it('Today shows 2 for two open visits; ＋ Start opens the arrival step', async () => {
    routeFetch(fetchMock, { [OPEN]: json(200, { items: [visitOf(), visitOf()] }) });
    renderPos(<StaffBottomNav />);
    expect(await screen.findByText('2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(push).toHaveBeenCalledWith('/visits/new');
  });

  it('Scenario: No open visit — the Today tab shows no badge', async () => {
    routeFetch(fetchMock, { [OPEN]: json(200, { items: [] }) });
    renderPos(<StaffBottomNav />);
    await screen.findByRole('link', { name: /Today/ });
    expect(screen.queryByText('0')).toBeNull();
  });

  it('More is the last item and opens /more', async () => {
    routeFetch(fetchMock, { [OPEN]: json(200, { items: [] }) });
    renderPos(<StaffBottomNav />);
    const links = await screen.findAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toStrictEqual(['/today', '/more']);
    expect(screen.getByRole('link', { name: 'More' })).toBeTruthy();
  });
});
