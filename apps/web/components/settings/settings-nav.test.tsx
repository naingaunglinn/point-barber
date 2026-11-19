// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type MeResponse, ScopeType } from '@point/shared';

import { IDS, meOf } from '../../test/pos-fixtures';
import { routeFetch } from '../../test/pos-render';
import { json, renderStaff } from '../../test/render';

// add-company-profile task 4.2 — organization spec "Settings › Company is shown to holders of a company code
// and editable only with company scope", scenarios "The company admin" and "Manager and barber"
// (AD-NAV-02 · AD-NAV-03 · AD-PERM-02 / 03): the entry "Company" under Settings — the More screen's
// Settings list on a phone, the rail's last module Settings with its sub-navigation from 768 px — only for
// a holder of a `company.*` code. The signed-in area as the session layer frames it, on /settings/company.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/settings/company',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../lib/session/navigate', () => ({ navigation: { assign: vi.fn() } }));
const { SessionLayer } = await import('../../lib/session/session-layer');
const { MoreScreen } = await import('../../app/staff/(authed)/more/more-screen');

const person = (grants: MeResponse['grants']): MeResponse =>
  meOf({ user: { ...meOf().user, ui_language: 2 }, grants });
const company = (code: string) => ({ code, scope_type: ScopeType.COMPANY, branch_ids: [] });
const branch = (code: string) => ({
  code,
  scope_type: ScopeType.BRANCHES,
  branch_ids: [IDS.B3],
});

const PEOPLE = {
  'U Kyaw Zin (Admin, company scope)': person([company('company.view'), company('company.update')]),
  'Ma Hnin (Manager B3)': person([branch('visit.view'), branch('sale.create')]),
  'Ko Aung (Barber B3)': person([branch('sale.create')]),
};

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderMore(me: MeResponse) {
  routeFetch(fetchMock, {
    'GET /api/v1/me': json(200, me),
    'GET /api/v1/me/visits?status=1&status=2': json(200, { items: [] }),
  });
  return renderStaff(
    <SessionLayer locale="en">
      <MoreScreen />
    </SessionLayer>,
  );
}

const railLinks = () =>
  [...document.querySelectorAll('[data-slot="rail"] a')].map((a) => a.getAttribute('href'));

describe('the Settings entry "Company"', () => {
  it('Scenario: The company admin — More lists Settings › Company; the rail ends with Settings, its sub-navigation names Company', async () => {
    renderMore(PEOPLE['U Kyaw Zin (Admin, company scope)']);
    const list = await screen.findByTestId('more-settings');
    expect(within(list).getByRole('heading', { name: 'Settings' })).toBeTruthy();
    const entry = within(list).getByTestId('more-settings-company');
    expect(entry.getAttribute('href')).toBe('/settings/company');
    expect(entry.textContent).toBe('Company');
    expect(railLinks()).toStrictEqual(['/today', '/settings/company']);
    const settings = document.querySelector('[data-slot="rail"] a[href="/settings/company"]');
    expect(settings?.getAttribute('aria-current')).toBe('page');
    expect(within(settings as HTMLElement).getByText('Settings')).toBeTruthy();
    const subNav = document.querySelector('[data-slot="sub-nav"]') as HTMLElement;
    const item = within(subNav).getByRole('link', { name: 'Company' });
    expect(item.getAttribute('href')).toBe('/settings/company');
    expect(item.getAttribute('aria-current')).toBe('page');
  });

  it.each(['Ma Hnin (Manager B3)', 'Ko Aung (Barber B3)'] as const)(
    'Scenario: Manager and barber — %s: no Settings in More and none in the rail',
    async (who) => {
      renderMore(PEOPLE[who]);
      await screen.findByTestId('more-name');
      expect(screen.queryByTestId('more-settings')).toBeNull();
      expect(railLinks()).toStrictEqual(['/today']);
    },
  );

  it('a holder of company.view alone (branch scope) sees the entry too — any company.* code', async () => {
    renderMore(person([branch('company.view')]));
    expect(await screen.findByTestId('more-settings-company')).toBeTruthy();
  });
});
