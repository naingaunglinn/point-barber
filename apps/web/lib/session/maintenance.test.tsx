// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@point/i18n';
import type { MeResponse } from '@point/shared';
import { Button } from '@point/ui';

import { meOf } from '../../test/pos-fixtures';
import { type Route, routeFetch } from '../../test/pos-render';
import { json, problem, renderStaff } from '../../test/render';
import { kyawZinMe } from '../../test/settings-fixtures';
import { api } from '../api/client';

// add-settings-store tasks 6.2 / 6.3 — settings spec "Staff who cannot pass see the maintenance notice"
// and the banner of "The Maintenance mode screen and the admin banner" (AD-NAV-08 · API-AUTH-06 ·
// AD-L10N-06 · AD-FMT-03 · design D10): a 503 `maintenance` from any call — `/me` too — replaces the screen
// with the notice in the page's language, the expected end and the message (the other language as
// fallback); "Try again" loads `/me` and clears it on a 200; a user who passes sees the banner.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/today',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('./navigate', () => ({ navigation: { assign: vi.fn() } }));
const { SessionLayer } = await import('./session-layer');

const CONTEXT = {
  until: '2026-10-05T22:00:00+06:30',
  message_mm: 'ဆာဗာ ပြင်နေပါတယ်',
  message_en: 'Server update',
};
const maintenance = (context: object = CONTEXT) =>
  json(503, problem(503, 'maintenance', { context }));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const koAung = (): MeResponse => meOf({ user: { ...meOf().user, ui_language: 1 } });

/** A screen of the signed-in area: "Cash" sends a payment, as the checkout does. */
function Checkout() {
  const t = useTranslations('today');
  return (
    <div data-testid="checkout">
      <p>{t('title')}</p>
      <Button
        data-testid="checkout-cash"
        onClick={() =>
          void api('/sales/sale-1/payments', { method: 'POST', body: {} }).catch(() => undefined)
        }
      >
        {t('nav.start')}
      </Button>
    </div>
  );
}

function render(routes: Record<string, Route>, locale: Locale = 'my') {
  routeFetch(fetchMock, {
    'GET /api/v1/me/visits?status=1&status=2': json(200, { items: [] }),
    ...routes,
  });
  return renderStaff(
    <SessionLayer locale={locale}>
      <Checkout />
    </SessionLayer>,
    { locale },
  );
}

describe('add-settings-store · settings · Staff who cannot pass see the maintenance notice', () => {
  it('Scenario: A barber sees the notice — in Myanmar, the expected end and the message, no other content', async () => {
    render({ 'GET /api/v1/me': maintenance() });
    const notice = await screen.findByTestId('maintenance-notice');
    expect(notice.querySelector('h1')?.textContent).toBe('စနစ်ကို ခဏ ပိတ်ထားပါတယ်');
    expect(screen.getByTestId('maintenance-notice-until').textContent).toBe(
      '05/Oct/2026 10:00 PM လောက်မှာ ပြန်သုံးလို့ ရပါမယ်',
    );
    expect(screen.getByTestId('maintenance-notice-message').textContent).toBe('ဆာဗာ ပြင်နေပါတယ်');
    expect(screen.getByRole('button', { name: 'ထပ်ကြိုးစားမယ်' })).toBeTruthy();
    expect(screen.queryByTestId('checkout')).toBeNull();
    // No Sign out: it would answer 503 too (proposal reading 8).
    expect(screen.queryByTestId('user-menu-sign-out')).toBeNull();
  });

  it('Scenario: A message in one language only — Myanmar empty, the English message is shown', async () => {
    render({ 'GET /api/v1/me': maintenance({ ...CONTEXT, message_mm: null }) });
    expect((await screen.findByTestId('maintenance-notice-message')).textContent).toBe(
      'Server update',
    );
  });

  it('the English notice; no expected end and no message when the admin gave none', async () => {
    render(
      { 'GET /api/v1/me': maintenance({ until: null, message_mm: null, message_en: null }) },
      'en',
    );
    const notice = await screen.findByTestId('maintenance-notice');
    expect(notice.querySelector('h1')?.textContent).toBe('Under maintenance');
    expect(screen.queryByTestId('maintenance-notice-until')).toBeNull();
    expect(screen.queryByTestId('maintenance-notice-message')).toBeNull();
  });

  it('Scenario: Maintenance starts while working — the payment answers 503 and the notice replaces the screen', async () => {
    render(
      {
        'GET /api/v1/me': json(200, koAung()),
        'POST /api/v1/sales/sale-1/payments': maintenance(),
      },
      'en',
    );
    fireEvent.click(await screen.findByTestId('checkout-cash'));
    expect(await screen.findByTestId('maintenance-notice')).toBeTruthy();
    expect(screen.queryByTestId('checkout')).toBeNull();
  });

  it('Scenario: Back after maintenance — "Try again" loads /me and shows the screen again', async () => {
    let off = false;
    render({ 'GET /api/v1/me': () => (off ? json(200, koAung()) : maintenance()) }, 'en');
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('maintenance-notice')).toBeTruthy());
    off = true;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('checkout')).toBeTruthy();
    expect(screen.queryByTestId('maintenance-notice')).toBeNull();
  });
});

describe('add-settings-store · settings · The Maintenance mode screen and the admin banner', () => {
  it('Scenario: The admin turns it on — every screen shows "Maintenance mode is ON" with its link', async () => {
    const me = kyawZinMe();
    render(
      { 'GET /api/v1/me': json(200, { ...me, system: { ...me.system, maintenance: true } }) },
      'en',
    );
    const banner = await screen.findByTestId('maintenance-banner');
    expect(banner.textContent).toContain('Maintenance mode is ON');
    expect(screen.getByTestId('maintenance-banner-link').getAttribute('href')).toBe(
      '/settings/maintenance',
    );
    expect(screen.getByTestId('maintenance-banner-link').textContent).toBe('Turn off');
    expect(screen.getByTestId('checkout')).toBeTruthy();
  });

  it('Scenario: The banner goes when it is off — no banner while /me says maintenance false', async () => {
    render({ 'GET /api/v1/me': json(200, kyawZinMe()) }, 'en');
    await screen.findByTestId('checkout');
    expect(screen.queryByTestId('maintenance-banner')).toBeNull();
  });
});
