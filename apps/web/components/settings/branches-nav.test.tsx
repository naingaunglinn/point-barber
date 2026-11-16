// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeResponse } from '@point/shared';

import { PEOPLE } from '../../test/branch-fixtures';
import { renderPos, routeFetch } from '../../test/pos-render';
import { json } from '../../test/render';

// add-branch-management task 4.1 — organization "Settings › Branches is shown only to holders of a branch
// code" (AD-NAV-02 · AD-PERM-03 · design D9): the Settings module of the rail and the Settings list of
// the More screen carry Branches for U Kyaw Zin (Admin, company scope) and Ma Hnin (seed Manager —
// branch.view at B3), not for Ko Aung (Barber, no branch code).
const pathname = vi.hoisted(() => ({ current: '/today' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => pathname.current,
  useSearchParams: () => new URLSearchParams(),
}));
const { useStaffRail } = await import('../pos/StaffBottomNav');
const { MoreScreen } = await import('../../app/staff/(authed)/more/more-screen');

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  pathname.current = '/today';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  routeFetch(fetchMock, { 'GET /api/v1/me/visits?status=1&status=2': json(200, { items: [] }) });
});
afterEach(() => vi.unstubAllGlobals());

/** The rail as data: module keys, each module's screens, the active module and screen. */
function RailProbe() {
  const rail = useStaffRail();
  return (
    <output data-testid="rail">
      {JSON.stringify({
        modules: rail.nav.map((module) => ({
          key: module.key,
          label: module.label,
          href: module.href,
          items: module.items?.map((item) => ({
            key: item.key,
            label: item.label,
            href: item.href,
          })),
        })),
        activeKey: rail.activeKey ?? null,
        activeItemKey: rail.activeItemKey ?? null,
      })}
    </output>
  );
}

const railOf = (me: MeResponse, locale: 'en' | 'my' = 'en') => {
  renderPos(<RailProbe />, { me, locale });
  return JSON.parse(screen.getByTestId('rail').textContent) as {
    modules: { key: string; label: string; href: string; items?: { key: string }[] }[];
    activeKey: string | null;
    activeItemKey: string | null;
  };
};

const SETTINGS = {
  key: 'settings',
  label: 'Settings',
  href: '/settings/branches',
  items: [{ key: 'branches', label: 'Branches', href: '/settings/branches' }],
};

describe('Settings › Branches in the rail (useStaffRail)', () => {
  it('Scenario: Who sees the item — U Kyaw Zin: Settings, the last module, with Branches', () => {
    const rail = railOf(PEOPLE.kyawZin);
    expect(rail.modules.map((module) => module.key)).toStrictEqual(['today', 'settings']);
    expect(rail.modules[1]).toStrictEqual(SETTINGS);
  });

  it('Scenario: Who sees the item — Ma Hnin (branch.view at B3): Settings with Branches', () => {
    expect(railOf(PEOPLE.hnin).modules[1]).toStrictEqual(SETTINGS);
  });

  it('Scenario: Who sees the item — Ko Aung (no branch code): no Settings module', () => {
    expect(railOf(PEOPLE.aung).modules.map((module) => module.key)).toStrictEqual(['today']);
  });

  it('labels the module and the screen in Myanmar', () => {
    const settings = railOf(PEOPLE.hnin, 'my').modules[1];
    expect(settings?.label).toBe('ဆက်တင်');
    expect(settings?.items).toStrictEqual([
      { key: 'branches', label: 'ဆိုင်ခွဲများ', href: '/settings/branches' },
    ]);
  });

  it('marks Settings › Branches active on the list, the new form and a detail page', () => {
    for (const path of ['/settings/branches', '/settings/branches/new', '/settings/branches/x']) {
      pathname.current = path;
      const rail = railOf(PEOPLE.kyawZin);
      expect([rail.activeKey, rail.activeItemKey]).toStrictEqual(['settings', 'branches']);
      document.body.innerHTML = '';
    }
  });
});

describe('Settings › Branches on the More screen', () => {
  it('Scenario: Who sees the item — U Kyaw Zin and Ma Hnin see Branches under Settings', () => {
    for (const me of [PEOPLE.kyawZin, PEOPLE.hnin]) {
      renderPos(<MoreScreen />, { me });
      const settings = screen.getByTestId('more-settings');
      expect(settings.querySelector('h2')?.textContent).toBe('Settings');
      const item = screen.getByTestId('more-settings-branches');
      expect(item.getAttribute('href')).toBe('/settings/branches');
      expect(item.textContent).toBe('Branches');
      document.body.innerHTML = '';
    }
  });

  it('Scenario: Who sees the item — Ko Aung sees no Settings list', () => {
    renderPos(<MoreScreen />, { me: PEOPLE.aung });
    expect(screen.getByTestId('more')).toBeTruthy();
    expect(screen.queryByTestId('more-settings')).toBeNull();
    expect(screen.queryByTestId('more-settings-branches')).toBeNull();
  });
});
