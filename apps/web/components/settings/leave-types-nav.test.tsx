// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeResponse } from '@point/shared';

import { LEAVE_PEOPLE } from '../../test/leave-type-fixtures';
import { renderPos, routeFetch } from '../../test/pos-render';
import { json } from '../../test/render';

// add-leave-types task 3.1 — leave "Settings › Leave types is shown only to holders of a leave-type code"
// (AD-NAV-02 · AD-PERM-03 · design D9): the rail's Settings module and the More screen's Settings list
// carry Leave types for U Kyaw Zin, not for Ma Hnin or Ko Aung.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/today',
  useSearchParams: () => new URLSearchParams(),
}));
const { useStaffRail } = await import('../pos/StaffBottomNav');
const { MoreScreen } = await import('../../app/staff/(authed)/more/more-screen');

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  routeFetch(fetchMock, { 'GET /api/v1/me/visits?status=1&status=2': json(200, { items: [] }) });
});
afterEach(() => vi.unstubAllGlobals());

function RailProbe() {
  const settings = useStaffRail().nav.find((module) => module.key === 'settings');
  return (
    <output data-testid="rail">
      {JSON.stringify(settings?.items?.map((item) => [item.key, item.label, item.href]) ?? [])}
    </output>
  );
}
const settingsOf = (me: MeResponse) => {
  const { unmount } = renderPos(<RailProbe />, { me });
  const items = JSON.parse(screen.getByTestId('rail').textContent) as string[][];
  unmount();
  return items;
};

describe('add-leave-types · leave · Settings › Leave types is shown only to holders of a leave-type code', () => {
  it('Scenario: The Admin sees the menu entry — rail and More', () => {
    expect(settingsOf(LEAVE_PEOPLE.kyawZin)).toContainEqual([
      'leaveTypes',
      'Leave types',
      '/settings/leave-types',
    ]);
    renderPos(<MoreScreen />, { me: LEAVE_PEOPLE.kyawZin });
    expect(screen.getByTestId('more-settings-leaveTypes').textContent).toBe('Leave types');
  });

  it('Scenario: The Manager and the Barber do not', () => {
    for (const me of [LEAVE_PEOPLE.hnin, LEAVE_PEOPLE.aung]) {
      const { unmount } = renderPos(<MoreScreen />, { me });
      expect(screen.queryByTestId('more-settings-leaveTypes')).toBeNull();
      unmount();
      expect(settingsOf(me).map(([key]) => key)).not.toContain('leaveTypes');
    }
  });
});
