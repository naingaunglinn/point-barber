// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CUSTOMER_IDS,
  PEOPLE,
  customerOf,
  maSuForAdmin,
} from '../../../../../test/customer-fixtures';
import { renderPos, routeFetch } from '../../../../../test/pos-render';
import { json, problem } from '../../../../../test/render';
import { mockViewport } from '../../../../../test/viewport';

// add-customer-management tasks 4.3 / 4.6 — "The customer page shows the profile, the statistics and the
// history" (AD-CUS-02 · AD-DET-01 · AD-DET-02 · AD-VIS-12 · AD-FMT-01 / 02 · design D11): the header (the
// name without an avatar, the `tel:` link on a phone, the badge, the archived banner), the notes or "No
// notes", and the five statistics of Ma Hnin (6 · 59,000 Ks · 28/Sep/2026 · Ko Aung · 2, with the caption)
// and of U Kyaw Zin (7 · 65,000 Ks · 03/Oct/2026 · – · 2, without it); `59,000 ကျပ်` in Myanmar.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => `/customers/${CUSTOMER_IDS.MA_SU}`,
  useSearchParams: () => new URLSearchParams(),
}));
const { CustomerScreen } = await import('./customer-screen');

const DETAIL = `GET /api/v1/customers/${CUSTOMER_IDS.MA_SU}`;
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  mockViewport(1280);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const stat = (key: string) => screen.getByTestId(`customer-stat-${key}`);
const value = (key: string) => stat(key).querySelector('[data-slot="kpi-value"]')?.textContent;

describe('The customer page — header and Overview', () => {
  it('Scenario: Ma Hnin opens Ma Su — Visits 6 · Total spent 59,000 Ks · Last visit 28/Sep/2026 · Preferred barber Ko Aung · No-shows 2, and the caption', async () => {
    routeFetch(fetchMock, { [DETAIL]: json(200, customerOf()) });
    renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.hnin });
    await screen.findByTestId('customer-overview');
    expect(['visits', 'totalSpent', 'lastVisit', 'preferredBarber', 'noShows'].map(value)).toStrictEqual([
      '6',
      '59,000 Ks',
      '28/Sep/2026',
      'Ko Aung',
      '2',
    ]);
    expect(screen.getByTestId('customer-scope-note').textContent).toBe('At your branches');
    expect(within(stat('totalSpent')).getByText('Total spent')).toBeTruthy();
  });

  it('Scenario: The admin sees no caption — Visits 7 · 65,000 Ks · 03/Oct/2026 · – · 2', async () => {
    routeFetch(fetchMock, { [DETAIL]: json(200, maSuForAdmin()) });
    renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.kyawZin });
    await screen.findByTestId('customer-overview');
    expect(['visits', 'totalSpent', 'lastVisit', 'preferredBarber', 'noShows'].map(value)).toStrictEqual([
      '7',
      '65,000 Ks',
      '03/Oct/2026',
      '–',
      '2',
    ]);
    expect(screen.queryByTestId('customer-scope-note')).toBeNull();
  });

  it('shows the money as 59,000 ကျပ် in Myanmar, with the caption in Myanmar', async () => {
    routeFetch(fetchMock, { [DETAIL]: json(200, customerOf()) });
    renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.hnin, locale: 'my' });
    await screen.findByTestId('customer-overview');
    expect(value('totalSpent')).toBe('59,000 ကျပ်');
    expect(screen.getByTestId('customer-scope-note').textContent).toBe('သင့်ဆိုင်ခွဲများမှာ');
    expect(within(stat('visits')).getByText('လာခဲ့သည့် အကြိမ်')).toBeTruthy();
  });

  it('shows the name without an avatar, the grouped phone as text from 768 px and no badge for an ACTIVE customer', async () => {
    routeFetch(fetchMock, { [DETAIL]: json(200, customerOf()) });
    renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.hnin });
    await screen.findByTestId('customer-overview');
    const header = screen.getByTestId('customer-header');
    expect(within(header).getByRole('heading', { level: 1 }).textContent).toBe('Ma Su');
    expect(header.querySelector('img')).toBeNull();
    expect(within(header).getByText('09 7712 3456')).toBeTruthy();
    expect(header.querySelector('a[href^="tel:"]')).toBeNull();
    expect(screen.queryByTestId('customer-status-badge')).toBeNull();
  });

  it('is a tel: link below 768 px', async () => {
    mockViewport(360);
    routeFetch(fetchMock, { [DETAIL]: json(200, customerOf()) });
    renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.aung });
    await screen.findByTestId('customer-overview');
    const link = screen.getByRole('link', { name: /09 7712 3456/ });
    expect(link.getAttribute('href')).toBe('tel:+95977123456');
  });

  it('shows the notes, or "No notes"', async () => {
    routeFetch(fetchMock, { [DETAIL]: json(200, customerOf()) });
    const { unmount } = renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.hnin });
    expect((await screen.findByTestId('customer-notes')).textContent).toContain('Prefers a short fade.');
    unmount();
    routeFetch(fetchMock, { [DETAIL]: json(200, customerOf({ notes: null })) });
    renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.hnin });
    await vi.waitFor(() => expect(screen.getByTestId('customer-notes').textContent).toContain('No notes'));
  });

  it('shows the muted "Inactive" badge for Daw Mya; an archived customer shows "Archived" and the banner', async () => {
    routeFetch(fetchMock, { [DETAIL]: json(200, customerOf({ status: 0 })) });
    const { unmount } = renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.hnin });
    expect((await screen.findByTestId('customer-status-badge')).textContent).toBe('Inactive');
    unmount();
    routeFetch(fetchMock, {
      [DETAIL]: json(200, customerOf({ archived_at: '2026-10-05T09:00:00.000+06:30' })),
    });
    renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.hnin });
    await vi.waitFor(() =>
      expect(screen.getByTestId('customer-status-badge').textContent).toBe('Archived'),
    );
    expect(screen.getByRole('status').textContent).toContain(
      'This customer is archived. Restore the customer to make changes.',
    );
  });
});

describe('The customer page — states and the page guard', () => {
  it('shows the error state with Retry for a server error', async () => {
    routeFetch(fetchMock, { [DETAIL]: json(500, problem(500, 'internal_error')) });
    renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.hnin });
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('an unknown customer is the 404 page', async () => {
    routeFetch(fetchMock, { [DETAIL]: json(404, problem(404, 'not_found')) });
    renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.hnin });
    expect((await screen.findByTestId('refused-page')).textContent).toContain(
      "This item doesn't exist or was archived.",
    );
  });

  it('Scenario: A user without a customer code — the forbidden page and no request', () => {
    renderPos(<CustomerScreen id={CUSTOMER_IDS.MA_SU} />, { me: PEOPLE.nobody });
    expect(screen.getByTestId('refused-page').textContent).toContain(
      "You don't have access to this page. Ask an admin if you need it.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
