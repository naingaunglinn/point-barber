// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Branch, BranchStatus, ScopeType } from '@point/shared';
import { toast } from '@point/ui';

import { branchKeys } from '../../../../../../lib/branches/branches.keys';
import { BRANCH_IDS, PEOPLE, branchOf } from '../../../../../../test/branch-fixtures';
import { renderPos, routeFetch, type Route } from '../../../../../../test/pos-render';
import { json, problem } from '../../../../../../test/render';

// add-branch-management tasks 4.2 / 4.5 / 4.7 — organization "The branch form creates and edits a branch
// with messages at the fields" and "The detail page deactivates and re-activates a branch for
// company-scope branch.delete holders" (AD-DET-01 · AD-FORM-08 · AD-RT-02 · AD-RSN-01 · AD-CONF-02 ·
// AD-PERM-02 · API-IDEM-04 · design D9).
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => `/settings/branches/x`,
  useSearchParams: () => new URLSearchParams(),
}));
const { BranchDetailScreen } = await import('./branch-detail-screen');

const T1 = '2026-10-05T09:30:00.123+06:30';
const T2 = '2026-10-05T09:31:00.456+06:30';
const B3 = branchOf({ updated_at: T1 });
const B4 = branchOf({
  id: BRANCH_IDS.B4,
  code: 'B4',
  name_mm: 'ပွိုင့် ၄.၀',
  name_en: 'Point 4.0',
  active_employees: 0,
  location_radius_meters: 100,
});
const url = (branch: Branch, tail = '') => `/api/v1/branches/${branch.id}${tail}`;

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Routes P1.BR.03 to the branches given, in turn (the last one stays), and the other routes as given. */
function serve(branches: readonly Branch[], routes: Record<string, Route> = {}) {
  const queue = new Map<string, Branch[]>();
  for (const branch of branches) queue.set(branch.id, [...(queue.get(branch.id) ?? []), branch]);
  const table: Record<string, Route> = { ...routes };
  for (const [id, list] of queue) {
    table[`GET /api/v1/branches/${id}`] = () => json(200, list.length > 1 ? list.shift() : list[0]);
  }
  routeFetch(fetchMock, table);
}

const field = (member: string) => screen.getByTestId(`branch-field-${member}`);
const input = (member: string, nth = 0) =>
  within(field(member)).getAllByRole('textbox')[nth] as HTMLInputElement;
const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });
/** The header's status badge: the muted badge of an INACTIVE branch, none for an ACTIVE one (AD-CMP-05). */
const badge = () => screen.queryByTestId('branch-status-badge');
const bodyOf = (method: string) => {
  const call = fetchMock.mock.calls.filter(([, init]) => init?.method === method).at(-1);
  return JSON.parse(String(call?.[1]?.body)) as unknown;
};
/** P1.BR.03 answers the branch the first time and 500 after it; `loads()` counts the GETs. */
function failAfterFirst(branch: Branch, routes: Record<string, Route> = {}) {
  let loads = 0;
  routeFetch(fetchMock, {
    ...routes,
    [`GET ${url(branch)}`]: () => {
      loads += 1;
      return loads === 1 ? json(200, branch) : json(500, problem(500, 'internal_error'));
    },
  });
  return { loads: () => loads };
}
/** The window gets the focus back (another app was in front): the live queries load again. */
const refocus = () =>
  act(async () => {
    window.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
const openMenu = () =>
  fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), {
    button: 0,
    pointerType: 'mouse',
  });

/** Save as a person presses it: the focus moves to the button first, then the click. */
async function save() {
  const button = screen.getByTestId('branch-save');
  act(() => button.focus());
  fireEvent.click(button);
  await flush();
  await flush();
}

describe('A branch — the header and the form', () => {
  it('shows the name, the code, the badge and the staff assigned today; the code is text', async () => {
    serve([B3]);
    renderPos(<BranchDetailScreen id={B3.id} />, { me: PEOPLE.kyawZin });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Point 3.0');
    const header = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement;
    expect(header.textContent).toContain('B3');
    expect(header.textContent).toContain('5 staff assigned today');
    expect(badge()).toBeNull();
    expect(header.querySelector('[data-slot="status-badge"]')).toBeNull();
    expect(within(field('code')).queryByRole('textbox')).toBeNull();
    expect(field('code').textContent).toContain('B3');
  });

  it('Scenario: Edit sends only the changed members and expected_updated_at; then the toast', async () => {
    const toastSpy = vi.spyOn(toast, 'success');
    const saved = { ...B3, phone: '09 7700 0003', updated_at: T2 };
    // After a save the list and the detail load again: the API then answers the saved branch.
    serve([B3, saved], { [`PATCH ${url(B3)}`]: json(200, saved) });
    renderPos(<BranchDetailScreen id={B3.id} />, { me: PEOPLE.kyawZin });
    await screen.findByTestId('branch-form');
    type(input('phone'), '09 7700 0003');
    await save();
    expect(bodyOf('PATCH')).toStrictEqual({ phone: '09 7700 0003', expected_updated_at: T1 });
    expect(toastSpy).toHaveBeenCalledWith('Branch saved');
    // The form starts again from the saved branch: the next save sends its updated_at.
    type(input('address_mm', 1), 'No. 3, Example Road');
    await save();
    expect(bodyOf('PATCH')).toStrictEqual({
      address_en: 'No. 3, Example Road',
      expected_updated_at: T2,
    });
  });

  it('Scenario: Read-only for the seed Manager — values as text, no input, no Save, no status action', async () => {
    serve([{ ...B3, phone: '09 7700 0003' }]);
    renderPos(<BranchDetailScreen id={B3.id} />, { me: PEOPLE.hnin });
    const form = await screen.findByTestId('branch-form');
    expect(within(form).queryAllByRole('textbox')).toHaveLength(0);
    expect(form.textContent).toContain('09 7700 0003');
    expect(form.textContent).toContain('Point 3.0');
    expect(screen.queryByTestId('branch-save')).toBeNull();
    expect(screen.queryByTestId('branch-reactivate')).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('Scenario: A stale save keeps the input — the banner with Reload, which shows the stored phone', async () => {
    const changed = { ...B3, phone: '09 7700 0003', updated_at: T2 };
    serve([B3, changed], { [`PATCH ${url(B3)}`]: json(409, problem(409, 'conflict')) });
    renderPos(<BranchDetailScreen id={B3.id} />, { me: PEOPLE.kyawZin });
    await screen.findByTestId('branch-form');
    type(input('address_mm', 1), 'No. 3, Example Road');
    await save();
    const banner = screen.getByTestId('branch-conflict-banner');
    expect(banner.textContent).toContain(
      'This branch was changed by someone else. Reload to see the changes.',
    );
    expect(input('address_mm', 1).value).toBe('No. 3, Example Road');
    fireEvent.click(within(banner).getByRole('button', { name: 'Reload' }));
    await flush();
    await flush();
    expect(input('phone').value).toBe('09 7700 0003');
    expect(screen.queryByTestId('branch-conflict-banner')).toBeNull();
  });

  it('a failed load in the background (window focus) keeps the form and what was typed', async () => {
    const get = failAfterFirst(B3);
    const { client } = renderPos(<BranchDetailScreen id={B3.id} />, { me: PEOPLE.kyawZin });
    await screen.findByTestId('branch-form');
    type(input('phone'), '09 7700 0003');
    type(input('address_mm', 1), 'No. 3, Example Road');
    await refocus();
    await waitFor(() =>
      expect(client.getQueryState(branchKeys.detail(B3.id))?.status).toBe('error'),
    );
    expect(get.loads()).toBe(2);
    expect(screen.getByTestId('branch-form')).toBeTruthy();
    expect(input('phone').value).toBe('09 7700 0003');
    expect(input('address_mm', 1).value).toBe('No. 3, Example Road');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('a Reload that fails after a stale save keeps the input and the banner with Reload, and says why', async () => {
    const get = failAfterFirst(B3, { [`PATCH ${url(B3)}`]: json(409, problem(409, 'conflict')) });
    renderPos(<BranchDetailScreen id={B3.id} />, { me: PEOPLE.kyawZin });
    await screen.findByTestId('branch-form');
    type(input('address_mm', 1), 'No. 3, Example Road');
    await save();
    const banner = screen.getByTestId('branch-conflict-banner');
    fireEvent.click(within(banner).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(get.loads()).toBe(2));
    await flush();
    expect(screen.getByTestId('branch-conflict-banner')).toBeTruthy();
    expect(input('address_mm', 1).value).toBe('No. 3, Example Road');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    // The 500's error ID (AD-STATE-03): the failure is shown, not swallowed (CG-ERR-01).
    expect(await screen.findByText(/0199a3f2/)).toBeTruthy();
  });

  it('leaving with an unsaved edit asks "Discard changes?"; Keep editing keeps it', async () => {
    serve([B3]);
    renderPos(<BranchDetailScreen id={B3.id} />, { me: PEOPLE.kyawZin });
    await screen.findByTestId('branch-form');
    type(input('phone'), '09 7700 0003');
    fireEvent.click(screen.getByTestId('branch-cancel'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(push).not.toHaveBeenCalled();
    expect(input('phone').value).toBe('09 7700 0003');
  });
});

describe('A branch — the status action (task 4.7)', () => {
  it('Scenario: Deactivating an unused branch — the reason dialog, then Inactive and Re-activate', async () => {
    const inactive = { ...B4, status: BranchStatus.INACTIVE, updated_at: T2 };
    serve([B4, inactive], { [`POST ${url(B4, '/status')}`]: json(200, inactive) });
    renderPos(<BranchDetailScreen id={B4.id} />, { me: PEOPLE.kyawZin });
    await screen.findByTestId('branch-form');
    expect(screen.queryByTestId('branch-deactivate')).toBeNull(); // behind the kebab
    openMenu();
    fireEvent.click(await screen.findByTestId('branch-deactivate'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Deactivate branch' });
    expect(dialog.textContent).toContain(
      'Point 4.0 will be hidden from the website and from booking. Its records stay, and you can re-activate it later.',
    );
    const reason = within(dialog).getByRole('textbox', { name: 'Reason (optional)' });
    expect(reason.getAttribute('maxlength')).toBe('500');
    expect(within(dialog).getByRole('button', { name: 'Keep active' })).toBeTruthy();
    type(reason, 'Not opening this year');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate branch' }));
    await flush();
    await flush();
    expect(bodyOf('POST')).toStrictEqual({
      status: BranchStatus.INACTIVE,
      reason: 'Not opening this year',
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(badge()?.textContent).toBe('Inactive');
    expect(badge()?.querySelector('[data-slot="status-badge"]')?.getAttribute('data-tone')).toBe(
      'muted',
    );
    // Re-activate is a visible secondary button of the header, not a menu item.
    expect(screen.getByTestId('branch-reactivate').getAttribute('role')).toBeNull();
    expect(screen.getByTestId('branch-reactivate').tagName).toBe('BUTTON');
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('Scenario: Deactivating a branch in use — the counts inside the dialog, B3 still ACTIVE (no badge)', async () => {
    serve([B3], {
      [`POST ${url(B3, '/status')}`]: json(
        409,
        problem(409, 'branch_in_use', {
          context: { open_bookings: 0, open_sales: 0, active_assignments: 5 },
        }),
      ),
    });
    renderPos(<BranchDetailScreen id={B3.id} />, { me: PEOPLE.kyawZin });
    await screen.findByTestId('branch-form');
    openMenu();
    fireEvent.click(await screen.findByTestId('branch-deactivate'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Deactivate branch' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate branch' }));
    await flush();
    await flush();
    expect(bodyOf('POST')).toStrictEqual({ status: BranchStatus.INACTIVE });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByTestId('branch-in-use').textContent).toBe(
      'This branch still has 5 assigned staff, 0 open bookings and 0 open sales.',
    );
    expect(badge()).toBeNull();
  });

  it('Scenario: Re-activating — a visible button, no dialog, then no badge and Deactivate behind the ⋮', async () => {
    const inactive = { ...B4, status: BranchStatus.INACTIVE };
    const active = { ...B4, status: BranchStatus.ACTIVE, updated_at: T2 };
    serve([inactive, active], { [`POST ${url(B4, '/status')}`]: json(200, active) });
    renderPos(<BranchDetailScreen id={B4.id} />, { me: PEOPLE.kyawZin });
    const reactivate = await screen.findByTestId('branch-reactivate');
    expect(reactivate.tagName).toBe('BUTTON');
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(badge()?.textContent).toBe('Inactive');
    fireEvent.click(reactivate);
    await flush();
    await flush();
    expect(bodyOf('POST')).toStrictEqual({ status: BranchStatus.ACTIVE });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(badge()).toBeNull();
    expect(screen.queryByTestId('branch-reactivate')).toBeNull();
    openMenu();
    expect(await screen.findByTestId('branch-deactivate')).toBeTruthy();
  });

  it('only company-scope branch.delete shows the action: not with branch.delete at branch scope', async () => {
    serve([B3]);
    const manager = {
      ...PEOPLE.hnin,
      grants: [
        ...PEOPLE.hnin.grants,
        { code: 'branch.delete', scope_type: ScopeType.BRANCHES, branch_ids: [BRANCH_IDS.B3] },
      ],
    };
    renderPos(<BranchDetailScreen id={B3.id} />, { me: manager });
    await screen.findByTestId('branch-form');
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.queryByTestId('branch-reactivate')).toBeNull();
  });
});

describe('A branch — the page guard (task 4.2)', () => {
  it('without a branch code: the forbidden page, with a link Home', () => {
    serve([B3]);
    renderPos(<BranchDetailScreen id={B3.id} />, { me: PEOPLE.aung });
    const page = screen.getByTestId('refused-page');
    expect(page.textContent).toContain(
      "You don't have access to this page. Ask an admin if you need it.",
    );
    expect(within(page).getByRole('link').getAttribute('href')).toBe('/');
  });

  it('a branch outside the read scope: the API answers 404 and the page says not found', async () => {
    routeFetch(fetchMock, {
      [`GET ${url(B3)}`]: json(404, problem(404, 'not_found')),
    });
    renderPos(<BranchDetailScreen id={B3.id} />, { me: PEOPLE.hnin });
    expect((await screen.findByTestId('refused-page')).textContent).toContain(
      "This item doesn't exist or was archived.",
    );
  });
});
