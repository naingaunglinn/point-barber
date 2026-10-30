// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderStaff } from '../../test/render';

// add-walkin-visit-checkout task 10.10 — visits spec "Without a connection the app points to paper and Late
// entry": the banner's help link opens /help/offline while offline, without a request (workbook case 4 of
// 22/Oct/2026 found the plain link answering ERR_INTERNET_DISCONNECTED). The shell shows the help on that
// path and keeps the screen it was opened from mounted underneath.
const pathname = vi.hoisted(() => ({ current: '/today' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const { StaffOfflineBanner, WithOfflineHelp } = await import('./OfflineHelp');

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

beforeEach(() => {
  pathname.current = '/today';
});
afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

describe('StaffOfflineBanner', () => {
  it('Scenario: The help page — offline, the link opens /help/offline in place (no page load)', () => {
    const push = vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
    renderStaff(<StaffOfflineBanner />);
    act(() => setOnline(false));
    const link = screen.getByRole('link', { name: 'How to add it later' });
    expect(link.getAttribute('href')).toBe('/help/offline');
    const followed = fireEvent.click(link);
    expect(followed).toBe(false);
    expect(push).toHaveBeenCalledWith(null, '', '/help/offline');
  });

  it('a tap on the banner text is not the link — nothing moves', () => {
    const push = vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
    renderStaff(<StaffOfflineBanner />);
    act(() => setOnline(false));
    fireEvent.click(screen.getByText(/^No connection\./));
    expect(push).not.toHaveBeenCalled();
  });

  it('online: no banner', () => {
    renderStaff(<StaffOfflineBanner />);
    expect(screen.queryByRole('link', { name: 'How to add it later' })).toBeNull();
  });
});

describe('WithOfflineHelp', () => {
  it('on /help/offline: the help once, the screen kept but hidden', () => {
    const shell = () => (
      <WithOfflineHelp>
        <p data-testid="kept" />
      </WithOfflineHelp>
    );
    const view = renderStaff(shell());
    const kept = screen.getByTestId('kept');
    pathname.current = '/help/offline';
    view.rerender(shell());
    expect(screen.getAllByTestId('offline-help')).toHaveLength(1);
    expect(screen.getByTestId('offline-help').textContent).toContain('Late entry');
    // The same element: the screen stays mounted (its state kept), only hidden.
    expect(screen.getByTestId('kept')).toBe(kept);
    expect(kept.parentElement?.className).toBe('hidden');
  });

  it('anywhere else: the screen, no help', () => {
    renderStaff(
      <WithOfflineHelp>
        <p data-testid="screen" />
      </WithOfflineHelp>,
    );
    expect(screen.queryByTestId('offline-help')).toBeNull();
    expect(screen.getByTestId('screen').parentElement?.className).toBe('contents');
  });
});
