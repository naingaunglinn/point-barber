// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type MeResponse, ScopeType } from '@point/shared';

import { IDS, meOf } from '../../test/pos-fixtures';
import { routeFetch } from '../../test/pos-render';
import { json, renderStaff } from '../../test/render';

// add-settings-store task 5.2 — settings spec "The Additional settings screen" (scenario "A barber has no
// settings") and "The Maintenance mode screen and the admin banner" (scenario "A manager has no maintenance
// screen") on the navigation (AD-NAV-02 · AD-NAV-03 · AD-PERM-02 / 03 · design D10): Settings is the rail's
// last module and a list on the More screen; Additional settings for any `settings.*` code, Maintenance
// mode for company-scope settings.update only; with neither, no Settings at all.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/settings/additional',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../lib/session/navigate', () => ({ navigation: { assign: vi.fn() } }));
const { SessionLayer } = await import('../../lib/session/session-layer');
const { MoreScreen } = await import('../../app/staff/(authed)/more/more-screen');

const person = (grants: MeResponse['grants']): MeResponse =>
  meOf({ user: { ...meOf().user, ui_language: 2 }, grants });
const company = (code: string) => ({ code, scope_type: ScopeType.COMPANY, branch_ids: [] });
const branch = (code: string) => ({ code, scope_type: ScopeType.BRANCHES, branch_ids: [IDS.B3] });

// The seed roles of spec-fixtures §2: the Admin at company scope, the Manager at B3, the Barber.
const KYAW_ZIN = person([company('settings.view'), company('settings.update')]);
const MA_HNIN = person([branch('settings.view'), branch('settings.update'), branch('visit.view')]);
const KO_AUNG = person([branch('sale.create'), branch('sale.late_entry')]);

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
const subNavLinks = () =>
  [...document.querySelectorAll('[data-slot="sub-nav"] a')].map((a) => [
    a.textContent,
    a.getAttribute('href'),
  ]);

describe('add-settings-store · settings · The Additional settings screen', () => {
  it('U Kyaw Zin — Settings last in the rail with Additional settings and Maintenance mode; More lists both', async () => {
    renderMore(KYAW_ZIN);
    const list = await screen.findByTestId('more-settings');
    expect(within(list).getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(within(list).getByTestId('more-settings-additional').getAttribute('href')).toBe(
      '/settings/additional',
    );
    expect(within(list).getByTestId('more-settings-maintenance').textContent).toBe(
      'Maintenance mode',
    );
    expect(railLinks()).toStrictEqual(['/today', '/settings/additional']);
    expect(subNavLinks()).toStrictEqual([
      ['Additional settings', '/settings/additional'],
      ['Maintenance mode', '/settings/maintenance'],
    ]);
    const active = document.querySelector('[data-slot="sub-nav"] a[aria-current="page"]');
    expect(active?.textContent).toBe('Additional settings');
  });

  it('Scenario: A barber has no settings — neither the rail nor the More screen shows Settings', async () => {
    renderMore(KO_AUNG);
    await screen.findByTestId('more-name');
    expect(screen.queryByTestId('more-settings')).toBeNull();
    expect(railLinks()).toStrictEqual(['/today']);
  });
});

describe('add-settings-store · settings · The Maintenance mode screen and the admin banner', () => {
  it('Scenario: A manager has no maintenance screen — Settings lists Additional settings only', async () => {
    renderMore(MA_HNIN);
    const list = await screen.findByTestId('more-settings');
    expect(within(list).getByTestId('more-settings-additional')).toBeTruthy();
    expect(within(list).queryByTestId('more-settings-maintenance')).toBeNull();
    expect(subNavLinks()).toStrictEqual([['Additional settings', '/settings/additional']]);
  });

  it('settings.view alone at a branch is enough for Additional settings (settings.view⁺)', async () => {
    renderMore(person([branch('settings.view')]));
    expect(await screen.findByTestId('more-settings-additional')).toBeTruthy();
    expect(screen.queryByTestId('more-settings-maintenance')).toBeNull();
  });
});
