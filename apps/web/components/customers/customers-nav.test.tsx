// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeResponse } from '@point/shared';

import { PEOPLE } from '../../test/customer-fixtures';
import { renderPos, routeFetch } from '../../test/pos-render';
import { json } from '../../test/render';

// add-customer-management task 4.2 — "The Customers menu is shown to holders of a customer code" (AD-NAV-01 ·
// AD-NAV-02 · AD-PERM-03 · design D11): the rail's Customers module after Today, the bottom-navigation item
// between ＋ Start and More, and the entry of the More screen — shown to Ko Aung (seed Barber) and Ma Hnin,
// hidden for a user without a `customer.*` code.
const pathname = vi.hoisted(() => ({ current: '/today' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => pathname.current,
  useSearchParams: () => new URLSearchParams(),
}));
const { StaffBottomNav, useStaffRail } = await import('../pos/StaffBottomNav');
const { MoreScreen } = await import('../../app/staff/(authed)/more/more-screen');

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  pathname.current = '/today';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  routeFetch(fetchMock, { 'GET /api/v1/me/visits?status=1&status=2': json(200, { items: [] }) });
});
afterEach(() => vi.unstubAllGlobals());

function RailProbe() {
  const rail = useStaffRail();
  return (
    <output data-testid="rail">
      {JSON.stringify({
        modules: rail.nav.map((module) => ({ key: module.key, label: module.label, href: module.href })),
        activeKey: rail.activeKey ?? null,
      })}
    </output>
  );
}

const railOf = (me: MeResponse, locale: 'en' | 'my' = 'en') => {
  renderPos(<RailProbe />, { me, locale });
  return JSON.parse(screen.getByTestId('rail').textContent) as {
    modules: { key: string; label: string; href: string }[];
    activeKey: string | null;
  };
};

describe('Customers in the rail (useStaffRail)', () => {
  it.each([
    ['Ko Aung', PEOPLE.aung],
    ['Ma Hnin', PEOPLE.hnin],
  ])('Scenario: Who sees the menu — %s: Customers right after Today', (_name, me) => {
    const rail = railOf(me);
    expect(rail.modules.map((module) => module.key)).toStrictEqual(['today', 'customers']);
    expect(rail.modules[1]).toStrictEqual({
      key: 'customers',
      label: 'Customers',
      href: '/customers',
    });
  });

  it('is named in Myanmar and active on /customers and below', () => {
    pathname.current = '/customers/new';
    const rail = railOf(PEOPLE.aung, 'my');
    expect(rail.modules[1]?.label).toBe('ဧည့်သည်များ');
    expect(rail.activeKey).toBe('customers');
  });

  it('Scenario: A user without a customer code — no Customers module', () => {
    expect(railOf(PEOPLE.nobody).modules.map((module) => module.key)).toStrictEqual(['today']);
  });
});

describe('Customers in the bottom navigation', () => {
  it('sits between ＋ Start and More: Today, ＋ Start, Customers, More', async () => {
    renderPos(<StaffBottomNav />, { me: PEOPLE.aung });
    const nav = await screen.findByRole('navigation');
    const labelled = [...nav.querySelectorAll('li')].map((item) => item.textContent?.trim());
    expect(labelled).toStrictEqual(['Today', 'Start', 'Customers', 'More']);
    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).toStrictEqual(['/today', '/customers', '/more']);
  });

  it('marks Customers current on /customers/<id>', async () => {
    pathname.current = '/customers/0199a3f2-0000-7000-800b-000000000001';
    renderPos(<StaffBottomNav />, { me: PEOPLE.hnin });
    const link = await screen.findByRole('link', { name: 'Customers' });
    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('Scenario: A user without a customer code — Today, ＋ Start and More only', async () => {
    renderPos(<StaffBottomNav />, { me: PEOPLE.nobody });
    await screen.findByRole('link', { name: 'More' });
    expect(screen.queryByRole('link', { name: 'Customers' })).toBeNull();
  });
});

describe('Customers on the More screen', () => {
  it('has the entry for Ko Aung, opening /customers', () => {
    renderPos(<MoreScreen />, { me: PEOPLE.aung });
    expect(screen.getByTestId('more-customers').getAttribute('href')).toBe('/customers');
  });

  it('has no entry for a user without a customer code', () => {
    renderPos(<MoreScreen />, { me: PEOPLE.nobody });
    expect(screen.queryByTestId('more-customers')).toBeNull();
  });
});
