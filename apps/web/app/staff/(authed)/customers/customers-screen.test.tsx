// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CUSTOMER_IDS, PEOPLE, listItemOf } from '../../../../test/customer-fixtures';
import { renderPos, routeFetch } from '../../../../test/pos-render';
import { json, problem } from '../../../../test/render';
import { mockViewport } from '../../../../test/viewport';

// add-customer-management tasks 4.3 / 4.4 — "The customer list screen searches and filters customers"
// (AD-CUS-01 · AD-LIST-01 / 02 / 05 · AD-FMT-04 · AD-CMP-05 · AD-STATE-01 … 04 · design D11) and the page
// guard of /customers (AD-PERM-02): Ma Hnin's search, the chips and the archived switch in the address,
// muted badges, Add customer for `customer.create` only, cards at 360 px, the two empty states and paging.
const push = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ current: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/customers',
  useSearchParams: () => new URLSearchParams(search.current),
}));
const { CustomersScreen } = await import('./customers-screen');

const LIST = 'GET /api/v1/customers?limit=25';
const page = (items: unknown[], nextCursor: string | null = null) =>
  json(200, { items, next_cursor: nextCursor, total: null });

const MA_SU = listItemOf();
const DAW_MYA = listItemOf({
  id: CUSTOMER_IDS.DAW_MYA,
  name: 'Daw Mya',
  phone: '09 7788 1122',
  phone_normalized: '+95977881122',
  status: 0,
  last_visit_at: null,
  visit_count: 0,
});
const U_BA = listItemOf({
  id: CUSTOMER_IDS.U_BA,
  name: 'U Ba',
  phone: '09 4411 2233',
  phone_normalized: '+95944112233',
  archived_at: '2026-10-05T09:00:00.000+06:30',
  last_visit_at: null,
  visit_count: 0,
});

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  push.mockReset();
  search.current = '';
  mockViewport(1280);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

const requests = () =>
  fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url)}`);
const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });

describe('The customer list — the table', () => {
  it("Scenario: Ma Hnin searches on her laptop — `7712 3456` finds one row: Ma Su · 09 7712 3456 · 28/Sep/2026 · 6 · no badge", async () => {
    routeFetch(fetchMock, {
      [LIST]: page([MA_SU, DAW_MYA]),
      'GET /api/v1/customers?q=7712+3456&limit=25': page([MA_SU]),
    });
    renderPos(<CustomersScreen />, { me: PEOPLE.hnin });
    await screen.findByTestId(`customer-row-${CUSTOMER_IDS.DAW_MYA}`);
    type(screen.getByRole('searchbox', { name: 'Name or phone' }), '7712 3456');
    const name = await screen.findByTestId(`customer-row-${CUSTOMER_IDS.MA_SU}`);
    await vi.waitFor(() => expect(screen.queryByTestId(`customer-row-${CUSTOMER_IDS.DAW_MYA}`)).toBeNull());
    const row = within(name.closest('tr') as HTMLElement);
    expect(row.getAllByRole('cell').map((cell) => cell.textContent)).toStrictEqual([
      'Ma Su',
      '09 7712 3456',
      '28/Sep/2026',
      '6',
      '',
    ]);
    expect(row.queryByText('Inactive')).toBeNull();
    expect(window.location.search).toBe('?q=7712+3456');
  });

  it('shows the five columns and no e-mail column and no merge action', async () => {
    routeFetch(fetchMock, { [LIST]: page([MA_SU]) });
    renderPos(<CustomersScreen />, { me: PEOPLE.hnin });
    await screen.findByTestId(`customer-row-${CUSTOMER_IDS.MA_SU}`);
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toStrictEqual([
      'Name',
      'Phone',
      'Last visit',
      'Visits',
      'Status',
    ]);
    expect(screen.queryByText(/merge/i)).toBeNull();
  });

  it('Scenario: Inactive and archived on request — status=0&include_archived=true, Daw Mya with a muted "Inactive" badge and U Ba "Archived"', async () => {
    routeFetch(fetchMock, {
      [LIST]: page([MA_SU]),
      'GET /api/v1/customers?status=0&include_archived=true&limit=25': page([DAW_MYA, U_BA]),
    });
    renderPos(<CustomersScreen />, { me: PEOPLE.hnin });
    await screen.findByTestId(`customer-row-${CUSTOMER_IDS.MA_SU}`);
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));
    fireEvent.click(screen.getByTestId('customer-filter-archived'));
    const daw = await screen.findByTestId(`customer-row-${CUSTOMER_IDS.DAW_MYA}`);
    const dawRow = within(daw.closest('tr') as HTMLElement);
    const badge = dawRow.getByText('Inactive');
    expect(badge.closest('[data-slot="status-badge"]')?.getAttribute('data-tone')).toBe('muted');
    const ba = within(
      screen.getByTestId(`customer-row-${CUSTOMER_IDS.U_BA}`).closest('tr') as HTMLElement,
    );
    expect(
      ba.getByText('Archived').closest('[data-slot="status-badge"]')?.getAttribute('data-tone'),
    ).toBe('muted');
    expect(window.location.search).toBe('?status=0&include_archived=true');
  });

  it('starts from the filters in the address, so Back restores them', async () => {
    search.current = 'status=0&include_archived=true&q=Mya';
    window.history.replaceState(null, '', `/customers?${search.current}`);
    routeFetch(fetchMock, {
      'GET /api/v1/customers?q=Mya&status=0&include_archived=true&limit=25': page([DAW_MYA]),
    });
    renderPos(<CustomersScreen />, { me: PEOPLE.hnin });
    await screen.findByTestId(`customer-row-${CUSTOMER_IDS.DAW_MYA}`);
    expect(screen.getByTestId('customer-filter-archived').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Inactive', pressed: true })).toBeTruthy();
  });

  it('opens the customer page from a row', async () => {
    routeFetch(fetchMock, { [LIST]: page([MA_SU]) });
    renderPos(<CustomersScreen />, { me: PEOPLE.hnin });
    fireEvent.click(await screen.findByText('Ma Su'));
    expect(push).toHaveBeenCalledWith(`/customers/${CUSTOMER_IDS.MA_SU}`);
  });
});

describe('The customer list — who sees Add customer, cards, empty states, paging', () => {
  it('Add customer only with customer.create — Ko Aung and U Kyaw Zin see it, a viewer does not', async () => {
    routeFetch(fetchMock, { [LIST]: page([MA_SU]) });
    const { unmount } = renderPos(<CustomersScreen />, { me: PEOPLE.aung });
    await screen.findByTestId(`customer-row-${CUSTOMER_IDS.MA_SU}`);
    fireEvent.click(screen.getByTestId('customer-new'));
    expect(push).toHaveBeenCalledWith('/customers/new');
    unmount();
    const viewer = { ...PEOPLE.aung, grants: PEOPLE.aung.grants.filter((g) => g.code === 'customer.view') };
    renderPos(<CustomersScreen />, { me: viewer });
    await screen.findByTestId(`customer-row-${CUSTOMER_IDS.MA_SU}`);
    expect(screen.queryByTestId('customer-new')).toBeNull();
  });

  it('Scenario: A barber on his phone — cards with the name, the phone, the last visit and the badge', async () => {
    mockViewport(360);
    routeFetch(fetchMock, { [LIST]: page([MA_SU, DAW_MYA]) });
    renderPos(<CustomersScreen />, { me: PEOPLE.aung });
    const name = await screen.findByTestId(`customer-row-${CUSTOMER_IDS.MA_SU}`);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByTestId('customer-new')).toBeTruthy();
    const card = (within(name.closest('li') ?? document.body));
    expect(card.getByText('09 7712 3456')).toBeTruthy();
    expect(card.getByText('28/Sep/2026')).toBeTruthy();
    const daw = within(screen.getByTestId(`customer-row-${CUSTOMER_IDS.DAW_MYA}`).closest('li') ?? document.body);
    expect(daw.getByText('Inactive')).toBeTruthy();
  });

  it('Scenario: Nothing found — "No customer matches this search."', async () => {
    routeFetch(fetchMock, {
      [LIST]: page([MA_SU]),
      'GET /api/v1/customers?q=zzz&limit=25': page([]),
    });
    renderPos(<CustomersScreen />, { me: PEOPLE.hnin });
    await screen.findByTestId(`customer-row-${CUSTOMER_IDS.MA_SU}`);
    type(screen.getByRole('searchbox', { name: 'Name or phone' }), 'zzz');
    expect(await screen.findByText('No customer matches this search.')).toBeTruthy();
  });

  it('shows the first-use empty state with Add customer when there is no customer at all', async () => {
    routeFetch(fetchMock, { [LIST]: page([]) });
    renderPos(<CustomersScreen />, { me: PEOPLE.aung });
    expect(
      await screen.findByText(
        'No customers yet. Customers are added when a phone is given at Finish, or with Add customer.',
      ),
    ).toBeTruthy();
  });

  it('pages 25 rows at a time: Next sends the cursor, Previous goes back', async () => {
    const rows = Array.from({ length: 25 }, (_, n) =>
      listItemOf({
        id: `0199a3f2-0000-7000-800b-0000000001${String(n).padStart(2, '0')}`,
        name: `Customer ${n + 1}`,
      }),
    );
    routeFetch(fetchMock, {
      [LIST]: page(rows, 'CURSOR1'),
      'GET /api/v1/customers?limit=25&cursor=CURSOR1': page([DAW_MYA]),
    });
    renderPos(<CustomersScreen />, { me: PEOPLE.hnin });
    await screen.findByText('Customer 25');
    expect(screen.getAllByTestId(/^customer-row-/)).toHaveLength(25);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Daw Mya');
    expect(requests()).toContain('GET /api/v1/customers?limit=25&cursor=CURSOR1');
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByText('Customer 25');
  });
});

describe('The customer list — errors and the page guard', () => {
  it('a failed first load shows the error state with Retry, and Retry loads again', async () => {
    let answer = json(500, problem(500, 'internal_error'));
    routeFetch(fetchMock, { [LIST]: () => answer });
    renderPos(<CustomersScreen />, { me: PEOPLE.hnin });
    const retry = await screen.findByRole('button', { name: 'Retry' });
    answer = page([MA_SU]);
    await act(async () => {
      fireEvent.click(retry);
    });
    await screen.findByTestId(`customer-row-${CUSTOMER_IDS.MA_SU}`);
  });

  it('Scenario: A user without a customer code — the forbidden page and no request', () => {
    renderPos(<CustomersScreen />, { me: PEOPLE.nobody });
    expect(screen.getByTestId('refused-page').textContent).toContain(
      "You don't have access to this page. Ask an admin if you need it.",
    );
    expect(requests()).toStrictEqual([]);
  });
});
