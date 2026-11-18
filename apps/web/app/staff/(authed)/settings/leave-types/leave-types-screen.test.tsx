// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LeaveType } from '@point/shared';
import { toast } from '@point/ui';

import { LEAVE_PEOPLE, TYPES } from '../../../../../test/leave-type-fixtures';
import { renderPos, routeFetch } from '../../../../../test/pos-render';
import { json, problem } from '../../../../../test/render';
import { mockViewport } from '../../../../../test/viewport';

// add-leave-types tasks 3.1, 3.2, 3.4 and 3.5 — leave "The leave-type list shows every type in its order
// with its paid flag and status", "The leave-type form creates and edits a type with messages at the
// fields" and the forbidden page of "Settings › Leave types is shown only to holders of a leave-type code"
// (AD-SET-04 · AD-LIST-02 / 06 · AD-FORM-01 – 03 / 09 · AD-RT-02 · AD-CONF-01 / 02 · AD-STATE-04 · D9).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/settings/leave-types',
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
const { LeaveTypesScreen } = await import('./leave-types-screen');

const LIST = '/api/v1/leave-types?status=0&status=1';
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(null, '', '/settings/leave-types');
  mockViewport(1280);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const listOf = (items: readonly LeaveType[], routes: Parameters<typeof routeFetch>[1] = {}) =>
  routeFetch(fetchMock, {
    [`GET ${LIST}`]: json(200, { items }),
    [`GET ${LIST}&include_archived=true`]: json(200, { items }),
    ...routes,
  });
const names = () =>
  screen.queryAllByTestId(/^leave-type-row-/).map((cell) => cell.textContent);
const sent = (method: string, path: string) => {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => String(url) === path && init?.method === method,
  );
  return call === undefined ? undefined : (JSON.parse(String(call[1]?.body)) as unknown);
};
const open = async (type: LeaveType) => {
  fireEvent.click(await screen.findByTestId(`leave-type-row-${type.id}`));
  return screen.findByTestId('leave-type-form');
};

describe('add-leave-types · leave · The leave-type list shows every type in its order', () => {
  it("Scenario: The admin's list — Paid · Unpaid, no badge on an Active type, New leave type", async () => {
    listOf([TYPES.paid, TYPES.sick, TYPES.unpaid]);
    renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.kyawZin });
    await screen.findByTestId(`leave-type-row-${TYPES.paid.id}`);
    expect(names()).toStrictEqual(['Paid leave', 'Sick leave', 'Unpaid leave']);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[1]?.textContent)).toStrictEqual([
      'Paid',
      'Unpaid',
      'Unpaid',
    ]);
    expect(screen.getByTestId('leave-types-list').querySelector('[data-slot="status-badge"]')).toBeNull();
    expect(screen.getByTestId('leave-type-new').textContent).toBe('New leave type');
  });

  it('Scenario: The Myanmar screen on a phone — three cards in order', async () => {
    mockViewport(360);
    listOf([TYPES.paid, TYPES.sick, TYPES.unpaid]);
    renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.kyawZin, locale: 'my' });
    await screen.findByTestId(`leave-type-row-${TYPES.paid.id}`);
    expect(names()).toStrictEqual(['လစာရခွင့်', 'ဆေးခွင့်', 'လစာမဲ့ခွင့်']);
    expect(screen.getByTestId(`leave-type-row-${TYPES.sick.id}`).closest('[data-slot="card"]')).not.toBeNull();
  });

  it('the Inactive chip shows an INACTIVE type with its badge; Archived adds the archived ones', async () => {
    const sickOff = { ...TYPES.sick, status: 0 as const };
    const archived = { ...TYPES.training, archived_at: '2026-10-05T10:00:00+06:30' };
    listOf([TYPES.paid, sickOff, TYPES.unpaid, archived]);
    renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.kyawZin });
    await screen.findByTestId(`leave-type-row-${TYPES.paid.id}`);
    expect(names()).toStrictEqual(['Paid leave', 'Unpaid leave']);
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));
    await waitFor(() => expect(names()).toContain('Sick leave'));
    const sickRow = screen.getByTestId(`leave-type-row-${TYPES.sick.id}`).closest('tr') as HTMLElement;
    expect(within(sickRow).getByText('Inactive')).toBeTruthy();
    fireEvent.click(screen.getByTestId('leave-types-archived'));
    const training = await screen.findByTestId(`leave-type-row-${TYPES.training.id}`);
    expect(within(training.closest('tr') as HTMLElement).getByText('Archived')).toBeTruthy();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(`${LIST}&include_archived=true`);
  });

  it('an empty filtered list says so; a failed load shows the error with Retry', async () => {
    listOf([{ ...TYPES.training, archived_at: '2026-10-05T10:00:00+06:30' }]);
    const { unmount } = renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.kyawZin });
    expect(await screen.findByText('No leave types match this filter.')).toBeTruthy();
    unmount();
    routeFetch(fetchMock, { [`GET ${LIST}`]: json(500, problem(500, 'internal_error')) });
    renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.kyawZin });
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('Scenario: Ko Aung opens /settings/leave-types — the forbidden page', () => {
    renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.aung });
    expect(screen.getByTestId('refused-page')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/leave-types'), expect.anything());
  });
});

describe('add-leave-types · leave · The leave-type form creates and edits a type with messages at the fields', () => {
  it('Scenario: Create from the dialog — Training, Paid; the toast', async () => {
    const saved = vi.spyOn(toast, 'success');
    listOf([TYPES.paid, TYPES.sick, TYPES.unpaid], {
      'POST /api/v1/leave-types': json(201, TYPES.training),
    });
    renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.kyawZin });
    fireEvent.click(await screen.findByTestId('leave-type-new'));
    await screen.findByTestId('leave-type-form');
    fireEvent.change(screen.getByTestId('leave-type-name-mm'), { target: { value: 'သင်တန်းခွင့်' } });
    fireEvent.change(screen.getByTestId('leave-type-name-en'), { target: { value: 'Training' } });
    fireEvent.click(screen.getByTestId('leave-type-paid'));
    fireEvent.click(screen.getByTestId('leave-type-save'));
    await waitFor(() => expect(saved).toHaveBeenCalledWith('Leave type saved'));
    expect(sent('POST', '/api/v1/leave-types')).toStrictEqual({
      name_mm: 'သင်တန်းခွင့်',
      name_en: 'Training',
      is_paid: true,
    });
    await waitFor(() => expect(screen.queryByTestId('leave-type-form')).toBeNull());
  });

  it('Paid leave must be chosen on create — nothing is sent', async () => {
    listOf([TYPES.paid]);
    renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.kyawZin });
    fireEvent.click(await screen.findByTestId('leave-type-new'));
    fireEvent.change(await screen.findByTestId('leave-type-name-mm'), { target: { value: 'သင်တန်းခွင့်' } });
    fireEvent.click(screen.getByTestId('leave-type-save'));
    await waitFor(() =>
      expect(within(screen.getByTestId('leave-type-field-is_paid')).getByText(/required/i)).toBeTruthy(),
    );
    expect(sent('POST', '/api/v1/leave-types')).toBeUndefined();
  });

  it('Scenario: A taken name at the field — the message under Name, the typed values kept', async () => {
    listOf([TYPES.paid, TYPES.sick], {
      'POST /api/v1/leave-types': json(409, problem(409, 'already_exists')),
    });
    renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.kyawZin });
    fireEvent.click(await screen.findByTestId('leave-type-new'));
    fireEvent.change(await screen.findByTestId('leave-type-name-mm'), { target: { value: 'ဆေးခွင့်' } });
    fireEvent.click(screen.getByTestId('leave-type-unpaid'));
    fireEvent.click(screen.getByTestId('leave-type-save'));
    expect(await screen.findByText('A leave type with this name already exists.')).toBeTruthy();
    expect((screen.getByTestId('leave-type-name-mm') as HTMLInputElement).value).toBe('ဆေးခွင့်');
  });

  it('an edit sends only the changed members and expected_updated_at; a stale save keeps the input and offers Reload', async () => {
    let calls = 0;
    listOf([TYPES.paid, TYPES.sick], {
      [`PATCH /api/v1/leave-types/${TYPES.sick.id}`]: () => {
        calls += 1;
        return calls === 1
          ? json(409, problem(409, 'conflict'))
          : json(200, { ...TYPES.sick, name_en: 'Sick' });
      },
    });
    renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.kyawZin });
    await open(TYPES.sick);
    fireEvent.change(screen.getByTestId('leave-type-name-en'), { target: { value: 'Sick' } });
    fireEvent.click(screen.getByTestId('leave-type-save'));
    expect(await screen.findByTestId('leave-type-reload')).toBeTruthy();
    expect(sent('PATCH', `/api/v1/leave-types/${TYPES.sick.id}`)).toStrictEqual({
      name_en: 'Sick',
      expected_updated_at: TYPES.sick.updated_at,
    });
    expect((screen.getByTestId('leave-type-name-en') as HTMLInputElement).value).toBe('Sick');
    expect(screen.getByText('Someone saved this just now. Reload to see the latest version.')).toBeTruthy();
  });

  it('without company-scope leave_type.update the values are text, with no Save', async () => {
    listOf([TYPES.paid, TYPES.sick]);
    renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.viewer });
    const form = await open(TYPES.sick);
    expect(within(form).getByText('Sick leave')).toBeTruthy();
    expect(screen.queryByTestId('leave-type-save')).toBeNull();
    expect(screen.queryByTestId('leave-type-new')).toBeNull();
  });

  it('Scenario: Archive a type in use — the consequence asked first, the refusal in the dialog', async () => {
    listOf([TYPES.paid, TYPES.sick], {
      [`POST /api/v1/leave-types/${TYPES.sick.id}/archive`]: json(
        409,
        problem(409, 'leave_type_in_use'),
      ),
    });
    renderPos(<LeaveTypesScreen />, { me: LEAVE_PEOPLE.kyawZin });
    await open(TYPES.sick);
    fireEvent.click(screen.getByTestId('leave-type-archive'));
    const confirm = await screen.findByRole('alertdialog');
    expect(
      within(confirm).getByText(
        "Sick leave will no longer be listed or offered. Past leave keeps this type. This can't be undone.",
        { exact: false },
      ),
    ).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Archive leave type' }));
    expect(
      await screen.findByText(
        'This leave type is used by leave that is still waiting for approval. Decide or cancel that leave first.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('leave-type-form')).toBeTruthy();
  });
});
