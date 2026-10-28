// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeResponse } from '@point/shared';

import { json, problem, renderStaff } from '../../test/render';

// add-foundation-auth-access tasks 7.3, 7.4, 7.8 and 7.9 — access spec "The app refreshes its grants on
// focus and after an unexpected 403" and "A user sets their own interface language on their account",
// auth spec "A lost session leads to the login screen …" (API-AUTH-05 · AD-PERM-03 · AD-STATE-04 ·
// AD-L10N-06 · D17). The start page of task 7.8 was temporary: add-walkin-visit-checkout task 10.1 makes
// `/` open Today and puts who is signed in, MM / EN and Sign out under More (owner 28/Oct/2026).

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
const assign = vi.hoisted(() => vi.fn<(url: string) => void>());
vi.mock('./navigate', () => ({ navigation: { assign } }));

const { SessionLayer } = await import('./session-layer');
const { MainQueryState } = await import('./main-query-state');
const { useCan } = await import('./grants');
const { MoreScreen } = await import('../../app/staff/(authed)/more/more-screen');
const { ApiProblem, api } = await import('../api/client');

const B3 = '0199a3f2-0000-7000-8001-0000000000b3';

function meOf(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user: {
      id: '0199a3f2-0000-7000-8002-00000000e004',
      email: 'aung@point.test',
      status: 1,
      ui_language: null,
      last_login_at: '2026-10-05T09:02:00+06:30',
    },
    employee: {
      id: '0199a3f2-0000-7000-8003-00000000e004',
      employee_code: 'E004',
      name_mm: 'ကိုအောင်',
      name_en: 'Ko Aung',
      photo_url: null,
      status: 1,
    },
    grants: [],
    branches_in_scope: [
      {
        id: B3,
        code: 'B3',
        name_mm: 'ပွိုင့် ၃.၀',
        name_en: 'Point 3.0',
        phone: null,
        status: 1,
        is_public: true,
      },
    ],
    today_branch_id: null,
    assigned_branch_ids: [B3],
    effective: { show_own_earnings: false },
    settings: {},
    system: { maintenance: false, server_time: '2026-10-05T10:42:00+06:30', default_language: 1 },
    session: {
      id: '0199a3f2-0000-7000-8004-000000000001',
      device_label: null,
      created_at: '2026-10-05T09:02:00+06:30',
    },
    ...overrides,
  };
}

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  assign.mockReset();
  refresh.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'point_locale=; Max-Age=0; Path=/';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Page content in the tests (a value, not JSX text — CG-I18N-01 lints JSX text). */
const PAGE = 'page';
const CONTENT = 'content';

const meCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/v1/me').length;

function SettingsGate() {
  const can = useCan();
  return (
    <p data-testid="can-settings">{can('settings.update', { branchId: B3 }) ? 'yes' : 'no'}</p>
  );
}

describe('add-foundation-auth-access · access · The app refreshes its grants on focus and after an unexpected 403', () => {
  it('Scenario: A changed role reaches the open app on focus (task 7.3)', async () => {
    // Answered by URL: the shell's other reads (the bottom nav's open visits) take no `/me` answer.
    const answers = [
      meOf({ grants: [{ code: 'settings.update', scope_type: 2, branch_ids: [B3] }] }),
      meOf({ grants: [] }),
    ];
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        url === '/api/v1/me'
          ? json(200, answers.length > 1 ? answers.shift() : answers[0])
          : json(200, { items: [] }),
      ),
    );
    renderStaff(
      <SessionLayer locale="en">
        <SettingsGate />
      </SessionLayer>,
    );
    expect((await screen.findByTestId('can-settings')).textContent).toBe('yes');
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(screen.getByTestId('can-settings').textContent).toBe('no'));
    expect(meCalls()).toBe(2);
    expect(assign).not.toHaveBeenCalled();
  });

  it('Scenario: An unexpected 403 — /me is loaded once more, the page shows forbidden and a link Home (task 7.9)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, meOf())));
    renderStaff(
      <SessionLayer locale="en">
        <p data-testid="page">{PAGE}</p>
      </SessionLayer>,
    );
    await screen.findByTestId('page');
    expect(meCalls()).toBe(1);
    fetchMock.mockResolvedValueOnce(json(403, problem(403, 'forbidden')));
    const failure = await api('/branches').catch((error: unknown) => error);
    await waitFor(() => expect(meCalls()).toBe(2));

    cleanup();
    renderStaff(<MainQueryState error={failure}>{CONTENT}</MainQueryState>);
    expect(
      screen.getByText("You don't have access to this page. Ask an admin if you need it."),
    ).toBeDefined();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/');
  });

  it('Scenario: Not found — the page says so and nobody is signed out (task 7.9)', () => {
    const failure = new ApiProblem(404, problem(404, 'not_found'), undefined);
    renderStaff(<MainQueryState error={failure}>{CONTENT}</MainQueryState>);
    expect(screen.getByText("This item doesn't exist or was archived.")).toBeDefined();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/');
    expect(assign).not.toHaveBeenCalled();
  });

  it('any other state shows the page', () => {
    renderStaff(<MainQueryState error={null}>{CONTENT}</MainQueryState>);
    expect(screen.getByText('content')).toBeDefined();
  });
});

describe('add-foundation-auth-access · auth · A lost session leads to the login screen with the reason and back to the same page', () => {
  it('Scenario: Signed out by an admin while the app is open', async () => {
    window.history.replaceState(null, '', '/?branch=B3');
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(401, problem(401, 'session_revoked', { reason: 3 }))),
    );
    renderStaff(<SessionLayer locale="en">{PAGE}</SessionLayer>);
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/login?reason=3&return_to=%2F%3Fbranch%3DB3'),
    );
    window.history.replaceState(null, '', '/');
  });

  it('an unauthenticated answer shows no reason', async () => {
    window.history.replaceState(null, '', '/today');
    fetchMock.mockImplementation(() => Promise.resolve(json(401, problem(401, 'unauthenticated'))));
    renderStaff(<SessionLayer locale="en">{PAGE}</SessionLayer>);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login?return_to=%2Ftoday'));
    window.history.replaceState(null, '', '/');
  });
});

describe('add-foundation-auth-access · access · A user sets their own interface language on their account', () => {
  it('Scenario: A shared phone does not pass one user’s language to the next (task 7.4)', async () => {
    document.cookie = 'point_locale=en; Path=/';
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(200, meOf({ user: { ...meOf().user, ui_language: null } }))),
    );
    renderStaff(<SessionLayer locale="en">{PAGE}</SessionLayer>);
    await waitFor(() => expect(document.cookie).toContain('point_locale=my'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('the cookie already holding the account’s language is left alone', async () => {
    document.cookie = 'point_locale=en; Path=/';
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(200, meOf({ user: { ...meOf().user, ui_language: 2 } }))),
    );
    renderStaff(<SessionLayer locale="en">{PAGE}</SessionLayer>);
    await screen.findByText('page');
    expect(document.cookie).toContain('point_locale=en');
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('add-walkin-visit-checkout task 10.1 · More shows who is signed in, MM / EN and Sign out', () => {
  const more = (me: MeResponse, locale: 'my' | 'en') => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, me)));
    return renderStaff(
      <SessionLayer locale={locale}>
        <MoreScreen />
      </SessionLayer>,
      { locale },
    );
  };

  it('A barber — Myanmar interface: the name in Myanmar', async () => {
    more(meOf(), 'my');
    expect((await screen.findByTestId('more-name')).textContent).toBe('ကိုအောင်');
  });

  it('English interface: the English name', async () => {
    more(meOf({ user: { ...meOf().user, ui_language: 2 } }), 'en');
    expect((await screen.findByTestId('more-name')).textContent).toBe('Ko Aung');
  });

  it('Sign out from More', async () => {
    more(meOf({ user: { ...meOf().user, ui_language: 2 } }), 'en');
    fireEvent.click(await screen.findByTestId('more-sign-out'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login?reason=1'));
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url === '/api/v1/auth/logout' && init?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('a 401 of a query in flight during Sign out does not redirect before the reason', async () => {
    let finishLogout: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation((url) => {
      if (url === '/api/v1/auth/logout') {
        return new Promise<Response>((resolve) => {
          finishLogout = resolve;
        });
      }
      if (url === '/api/v1/me/visits')
        return Promise.resolve(json(401, problem(401, 'unauthenticated')));
      return Promise.resolve(json(200, meOf({ user: { ...meOf().user, ui_language: 2 } })));
    });
    renderStaff(
      <SessionLayer locale="en">
        <MoreScreen />
      </SessionLayer>,
      { locale: 'en' },
    );
    fireEvent.click(await screen.findByTestId('more-sign-out'));
    await expect(api('/me/visits')).rejects.toBeInstanceOf(ApiProblem);
    expect(assign).not.toHaveBeenCalled();
    finishLogout(new Response(null, { status: 204 }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login?reason=1'));
    expect(assign).toHaveBeenCalledTimes(1);
  });
});
