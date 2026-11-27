// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeResponse } from '@point/shared';

import { REASON_PEOPLE } from '../../test/cancel-reason-fixtures';
import { renderPos, routeFetch } from '../../test/pos-render';
import { json } from '../../test/render';

// add-booking-cancel-reasons task 4.1 — spec "Settings › Cancel reasons keeps the master list" (AD-NAV-02 ·
// AD-PERM-03 · design D9): the Settings module of the rail and the Settings list of the More screen carry
// Cancel reasons for U Kyaw Zin and for a holder of any cancel-reason code at any scope (Ko Zaw's
// "Reasons viewer" at B1), not for Ma Hnin or Ko Aung.
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

describe('add-booking-cancel-reasons · booking · Settings › Cancel reasons is shown only to holders of a cancel-reason code', () => {
  it('Scenario: The Admin and a read-only viewer see the menu entry — rail and More', () => {
    for (const me of [REASON_PEOPLE.kyawZin, REASON_PEOPLE.viewer]) {
      expect(settingsOf(me)).toContainEqual([
        'cancelReasons',
        'Cancel reasons',
        '/settings/cancel-reasons',
      ]);
      const { unmount } = renderPos(<MoreScreen />, { me });
      expect(screen.getByTestId('more-settings-cancelReasons').textContent).toBe('Cancel reasons');
      unmount();
    }
  });

  it('Scenario: A barber looks at Settings — Cancel reasons is not listed', () => {
    for (const me of [REASON_PEOPLE.hnin, REASON_PEOPLE.aung]) {
      const { unmount } = renderPos(<MoreScreen />, { me });
      expect(screen.queryByTestId('more-settings-cancelReasons')).toBeNull();
      unmount();
      expect(settingsOf(me).map(([key]) => key)).not.toContain('cancelReasons');
    }
  });
});
