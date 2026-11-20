// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BranchStatus, EmployeeStatus, UserStatus, type MeResponse } from '@point/shared';
import { useUnsavedChanges } from '@point/ui';

import { json, problem, renderStaff } from '../../test/render';

// add-unsaved-changes-guard groups 2 and 3 — the guard in the staff shell (ui-foundation "Navigation links ask
// …", "Programmatic navigation asks …", "Sign out asks first …", "Closing or reloading the tab …", "A lost
// session goes to the login screen without a question" · UG3 · UG4 · AD-LAY-01 · AD-LAY-03 · AD-NAV-01 ·
// AD-NAV-07 · AD-AUTH-01). A page with one dirty form stands in for Settings › Company.
const router = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  replace: vi.fn<(href: string) => void>(),
  back: vi.fn<() => void>(),
  refresh: vi.fn<() => void>(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/settings/company',
  useSearchParams: () => new URLSearchParams(),
}));
const assign = vi.hoisted(() => vi.fn<(url: string) => void>());
vi.mock('./navigate', () => ({ navigation: { assign } }));

const { SessionLayer } = await import('./session-layer');
const { MoreScreen } = await import('../../app/staff/(authed)/more/more-screen');
const { api } = await import('../api/client');

const B3 = '0199a3f2-0000-7000-8001-0000000000b3';
const QUESTION = 'Discard changes?';

function meOf(): MeResponse {
  return {
    user: {
      id: '0199a3f2-0000-7000-8002-00000000e004',
      email: 'aung@point.test',
      status: UserStatus.ACTIVE,
      ui_language: 2,
      last_login_at: '2026-10-05T09:02:00+06:30',
    },
    employee: {
      id: '0199a3f2-0000-7000-8003-00000000e004',
      employee_code: 'E004',
      name_mm: 'ကိုအောင်',
      name_en: 'Ko Aung',
      photo_url: null,
      status: EmployeeStatus.ACTIVE,
    },
    grants: [],
    branches_in_scope: [
      {
        id: B3,
        code: 'B3',
        name_mm: 'ပွိုင့် ၃.၀',
        name_en: 'Point 3.0',
        phone: null,
        status: BranchStatus.ACTIVE,
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
  };
}

const PHONE = 'phone';
function Form() {
  const [value, setValue] = useState('');
  useUnsavedChanges(value !== '');
  return <input aria-label={PHONE} value={value} onChange={(e) => setValue(e.target.value)} />;
}

const fetchMock = vi.fn<typeof fetch>();
const logouts = () =>
  fetchMock.mock.calls.filter(([url]) => url === '/api/v1/auth/logout').length;

beforeEach(() => {
  fetchMock.mockReset();
  assign.mockReset();
  for (const fn of Object.values(router)) fn.mockReset();
  router.push.mockImplementation((href) => window.history.pushState(null, '', href));
  router.replace.mockImplementation((href) => window.history.replaceState(null, '', href));
  fetchMock.mockImplementation((url) =>
    Promise.resolve(
      url === '/api/v1/me'
        ? json(200, meOf())
        : url === '/api/v1/auth/logout'
          ? json(204)
          : json(200, { items: [] }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(null, '', '/more');
  window.history.pushState(null, '', '/settings/company');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openPage(page = <Form />) {
  renderStaff(<SessionLayer locale="en">{page}</SessionLayer>);
  return screen.findByRole('textbox', { name: PHONE });
}
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });
const question = () => screen.findByRole('alertdialog', { name: QUESTION });

describe('The staff shell asks before it leaves a page with unsaved edits (tasks 2.1, 2.2)', () => {
  it('a rail click and a bottom-navigation click ask; the link does not open', async () => {
    const field = await openPage();
    for (const link of screen.getAllByRole('link', { name: /^Today/ })) {
      type(field, '09 400 000 112');
      fireEvent.click(link);
      const dialog = await question();
      expect(router.push).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    }
    expect((screen.getByRole('textbox', { name: PHONE }) as HTMLInputElement).value).toBe(
      '09 400 000 112',
    );
  });

  it('Discard on a link opens it in place of the guard entry', async () => {
    const field = await openPage();
    type(field, '09 400 000 112');
    fireEvent.click(screen.getAllByRole('link', { name: /^Today/ })[0] as HTMLElement);
    fireEvent.click(within(await question()).getByRole('button', { name: 'Discard' }));
    expect(router.replace).toHaveBeenCalledWith('/today');
  });

  it('without edits a rail click does not ask', async () => {
    await openPage();
    const link = screen.getAllByRole('link', { name: /^Today/ })[0] as HTMLElement;
    fireEvent.click(link);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('the centre ＋ action asks; Discard opens /visits/new', async () => {
    const field = await openPage();
    const start = await screen.findByRole('button', { name: 'Start' });
    fireEvent.click(start);
    expect(router.push).toHaveBeenCalledWith('/visits/new');
    router.push.mockClear();
    window.history.replaceState(null, '', '/settings/company');
    type(field, '09 400 000 112');
    fireEvent.click(start);
    const dialog = await question();
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(router.replace).toHaveBeenCalledWith('/visits/new');
  });
});

describe('Sign out asks first and leaves without a second question (tasks 3.1, 3.2)', () => {
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it.each([
    ['the user menu', 'user-menu-sign-out'],
    ['the More screen', 'more-sign-out'],
  ])('%s: the question first, no request; Keep editing sends nothing', async (_name, testId) => {
    const field = await openPage(
      <>
        <Form />
        <MoreScreen />
      </>,
    );
    type(field, '09 400 000 112');
    fireEvent.click(await screen.findByTestId(testId));
    const dialog = await question();
    expect(logouts()).toBe(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(logouts()).toBe(0);
    expect(assign).not.toHaveBeenCalled();
  });

  it('Discard signs out and the browser does not ask again', async () => {
    const field = await openPage();
    type(field, '09 400 000 112');
    expect(unload()).toBe(true);
    fireEvent.click(await screen.findByTestId('user-menu-sign-out'));
    fireEvent.click(within(await question()).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login?reason=1'));
    expect(logouts()).toBe(1);
    expect(unload()).toBe(false);
  });

  it('without edits Sign out goes at once', async () => {
    await openPage();
    fireEvent.click(await screen.findByTestId('user-menu-sign-out'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login?reason=1'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('A lost session goes to the login screen without a question (task 3.3 · UG4)', () => {
  it('a dirty form and a 401 session_revoked reason 2: the login URL, no question, no browser question', async () => {
    const field = await openPage();
    type(field, '09 400 000 112');
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(401, problem(401, 'session_revoked', { reason: 2 }))),
    );
    await api('/me/visits').catch(() => undefined);
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/login?reason=2&return_to=%2Fsettings%2Fcompany'),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
