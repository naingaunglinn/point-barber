// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type BranchSummary, BranchStatus } from '@point/shared';

import { BRANCH_IDS, PEOPLE, SUMMARIES } from '../../../../../test/branch-fixtures';
import { renderPos, routeFetch } from '../../../../../test/pos-render';
import { json } from '../../../../../test/render';
import { mockViewport } from '../../../../../test/viewport';

// add-branch-management tasks 4.2 / 4.3 — organization "The branch list shows the branches the user's
// branch grants cover" and "Settings › Branches is shown only to holders of a branch code" (AD-LIST-01 /
// 02 / 06 · AD-STATE-02 / 04 · API-PERM-07 · design D9).
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/settings/branches',
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
const { BranchesScreen } = await import('./branches-screen');

const B4: BranchSummary = {
  id: BRANCH_IDS.B4,
  code: 'B4',
  name_mm: 'ပွိုင့် ၄.၀',
  name_en: 'Point 4.0',
  phone: null,
  status: BranchStatus.INACTIVE,
  is_public: true,
};
const ALL = [SUMMARIES.B3, SUMMARIES.B1, SUMMARIES.B2];

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(null, '', '/settings/branches');
  mockViewport(1280);
});
afterEach(() => vi.unstubAllGlobals());

const listOf = (items: readonly BranchSummary[]) =>
  routeFetch(fetchMock, { 'GET /api/v1/branches': json(200, { items }) });

/** The code of each table row (`branch-row-<code>`), in order. */
const codes = () =>
  screen
    .queryAllByTestId(/^branch-row-/)
    .map((cell) => cell.getAttribute('data-testid')?.slice(11));

const rowOf = (code: string) =>
  screen.getByTestId(`branch-row-${code}`).closest('tr') as HTMLElement;

describe('Settings › Branches — the list', () => {
  it("Scenario: The admin's list — 3 rows by code, each Active and Shown, and New branch", async () => {
    listOf(ALL);
    renderPos(<BranchesScreen />, { me: PEOPLE.kyawZin });
    await screen.findByTestId('branch-row-B1');
    expect(codes()).toStrictEqual(['B1', 'B2', 'B3']);
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toStrictEqual([
      'Code',
      'Name',
      'Phone',
      'Website',
      'Status',
    ]);
    for (const [code, name] of [
      ['B1', 'Point 1.0'],
      ['B2', 'Point 2.0'],
      ['B3', 'Point 3.0'],
    ] as const) {
      const row = within(rowOf(code));
      expect(row.getByText(name)).toBeTruthy();
      expect(row.getByText('Shown')).toBeTruthy();
      expect(row.getByText('Active')).toBeTruthy();
    }
    expect(screen.getByTestId('branch-new').textContent).toBe('New branch');
    fireEvent.click(screen.getByTestId('branch-new'));
    expect(push).toHaveBeenCalledWith('/settings/branches/new');
  });

  it("Scenario: The manager's list — the one row B3 and no New branch", async () => {
    listOf(ALL);
    renderPos(<BranchesScreen />, { me: PEOPLE.hnin });
    await screen.findByTestId('branch-row-B3');
    expect(codes()).toStrictEqual(['B3']);
    expect(screen.queryByTestId('branch-new')).toBeNull();
  });

  it('Scenario: Status filter — Inactive shows the one row B4 with the badge Inactive', async () => {
    listOf([...ALL, B4]);
    renderPos(<BranchesScreen />, { me: PEOPLE.kyawZin });
    await screen.findByTestId('branch-row-B4');
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));
    expect(codes()).toStrictEqual(['B4']);
    expect(within(rowOf('B4')).getByText('Inactive')).toBeTruthy();
    expect(window.location.search).toBe(`?status=${BranchStatus.INACTIVE}`);
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(codes()).toStrictEqual(['B1', 'B2', 'B3', 'B4']);
  });

  it('reads the status filter from the address', async () => {
    window.history.replaceState(null, '', `/settings/branches?status=${BranchStatus.ACTIVE}`);
    listOf([...ALL, B4]);
    renderPos(<BranchesScreen />, { me: PEOPLE.kyawZin });
    await screen.findByTestId('branch-row-B1');
    expect(codes()).toStrictEqual(['B1', 'B2', 'B3']);
  });

  it('Scenario: Nothing matches the filter — the empty state and no row', async () => {
    listOf([...ALL, B4]);
    renderPos(<BranchesScreen />, { me: PEOPLE.hnin });
    await screen.findByTestId('branch-row-B3');
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));
    expect(codes()).toStrictEqual([]);
    expect(document.querySelector('[data-slot="empty-state"]')?.textContent).toBe(
      'No branches match this filter.',
    );
  });

  it('a row opens the branch', async () => {
    listOf(ALL);
    renderPos(<BranchesScreen />, { me: PEOPLE.kyawZin });
    fireEvent.click(await screen.findByTestId('branch-row-B3'));
    expect(push).toHaveBeenCalledWith(`/settings/branches/${BRANCH_IDS.B3}`);
  });

  it('a table from 768 px, one card per branch below — code, name, status badge and phone', async () => {
    listOf([{ ...SUMMARIES.B3, phone: '09 7700 0003' }]);
    mockViewport(360);
    const { unmount } = renderPos(<BranchesScreen />, { me: PEOPLE.hnin });
    await screen.findByTestId('branch-row-B3');
    expect(screen.queryByRole('table')).toBeNull();
    const card = screen.getByTestId('branch-row-B3').closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText('Point 3.0')).toBeTruthy();
    expect(within(card).getByText('Active')).toBeTruthy();
    expect(within(card).getByText('09 7700 0003')).toBeTruthy();
    fireEvent.click(screen.getByTestId('branch-row-B3'));
    expect(push).toHaveBeenCalledWith(`/settings/branches/${BRANCH_IDS.B3}`);
    unmount();
    mockViewport(768);
    renderPos(<BranchesScreen />, { me: PEOPLE.hnin });
    await screen.findByTestId('branch-row-B3');
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('works in Myanmar: the columns, the names and the badge', async () => {
    listOf(ALL);
    renderPos(<BranchesScreen />, { me: PEOPLE.kyawZin, locale: 'my' });
    await screen.findByTestId('branch-row-B3');
    expect(within(rowOf('B3')).getByText('ပွိုင့် ၃.၀')).toBeTruthy();
    expect(within(rowOf('B3')).getByText('ဖွင့်ထား')).toBeTruthy();
    expect(screen.getByTestId('branch-new').textContent).toBe('ဆိုင်ခွဲအသစ်');
  });
});

describe('Settings › Branches — the page guard', () => {
  it('Scenario: Opening the screen by its address — Ko Aung sees the forbidden page with a link Home', () => {
    listOf(ALL);
    renderPos(<BranchesScreen />, { me: PEOPLE.aung });
    const page = screen.getByTestId('refused-page');
    expect(page.textContent).toContain(
      "You don't have access to this page. Ask an admin if you need it.",
    );
    expect(within(page).getByRole('link').getAttribute('href')).toBe('/');
    expect(screen.queryByTestId('branches-list')).toBeNull();
  });
});
