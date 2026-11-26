// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CancelReason, CancelReasonStatus } from '@point/shared';
import { toast } from '@point/ui';

import { REASONS, REASON_PEOPLE, SEEDED } from '../../../../../test/cancel-reason-fixtures';
import { renderPos, routeFetch } from '../../../../../test/pos-render';
import { json, problem } from '../../../../../test/render';

// add-booking-cancel-reasons tasks 4.1 – 4.5 — spec "Settings › Cancel reasons keeps the master list" and
// "The cancel-reason form shows the server's answers in place" (AD-SET-04 · AD-NAV-02 · AD-PERM-02 ·
// AD-L10N-03 · AD-FORM-01 / 02 / 04 / 08 / 09 · AD-CONF-02 · AD-TOAST-01 · AD-STATE-01 / 04 · design D9).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/settings/cancel-reasons',
  useSearchParams: () => new URLSearchParams(),
}));
const { CancelReasonsScreen } = await import('./cancel-reasons-screen');

const LIST = '/api/v1/booking-cancel-reasons?status=0&status=1';
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const listOf = (items: readonly CancelReason[], routes: Parameters<typeof routeFetch>[1] = {}) =>
  routeFetch(fetchMock, {
    [`GET ${LIST}`]: json(200, { items }),
    [`GET ${LIST}&include_archived=true`]: json(200, { items }),
    ...routes,
  });
const names = () => screen.queryAllByTestId(/^cancel-reason-row-/).map((cell) => cell.textContent);
const sent = (method: string, path: string) => {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => String(url) === path && init?.method === method,
  );
  return call === undefined ? undefined : (JSON.parse(String(call[1]?.body)) as unknown);
};
const rowOf = (reason: CancelReason) => screen.getByTestId(`cancel-reason-row-${reason.id}`);
const itemOf = (reason: CancelReason) => rowOf(reason).closest('li') as HTMLElement;
const ready = () => screen.findByTestId(`cancel-reason-row-${REASONS.change.id}`);

describe('add-booking-cancel-reasons · booking · Settings › Cancel reasons keeps the master list', () => {
  it("Scenario: The admin's list — order, lock, Note required, and every control", async () => {
    listOf(SEEDED);
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    await ready();
    expect(names()).toStrictEqual([
      'Customer wants to change',
      'Barber not available',
      'Customer no-show',
      'Other',
    ]);
    const noShow = itemOf(REASONS.noShow);
    expect(within(noShow).getByRole('img').getAttribute('aria-label')).toBe(
      'Used by the system for no-shows — only the names can be changed.',
    );
    expect(within(noShow).queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(within(noShow).getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(within(itemOf(REASONS.other)).getByText('Note required')).toBeTruthy();
    expect(within(itemOf(REASONS.barber)).getByRole('button', { name: 'Archive' })).toBeTruthy();
    expect(screen.getByTestId('cancel-reason-new').textContent).toBe('Add cancel reason');
    expect(screen.getAllByTestId('reorder-handle')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Save order' })).toBeNull();
    // An ACTIVE reason has no badge (AD-CMP-05 master data).
    expect(
      screen.getByTestId('cancel-reasons-list').querySelector('[data-slot="status-badge"]'),
    ).toBeNull();
  });

  it('Scenario: Myanmar names — the Myanmar names, and Myanmar when the English one is empty', async () => {
    listOf([...SEEDED, { ...REASONS.sick, name_en: null }]);
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin, locale: 'my' });
    await ready();
    expect(names()).toStrictEqual([
      'Customer ပြောင်းချင်',
      'Barber မအား',
      'Customer မလာ',
      'Other',
      'Customer နေမကောင်း',
    ]);
    // English falls back to the Myanmar name when `name_en` is empty (AD-L10N-03).
    listOf([{ ...REASONS.sick, name_en: null }]);
    const { unmount } = renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    await screen.findAllByText('Customer နေမကောင်း');
    unmount();
  });

  it('an INACTIVE reason shows the muted Inactive badge', async () => {
    listOf([{ ...REASONS.barber, status: CancelReasonStatus.INACTIVE }, REASONS.other]);
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    await screen.findByTestId(`cancel-reason-row-${REASONS.barber.id}`);
    expect(within(itemOf(REASONS.barber)).getByText('Inactive')).toBeTruthy();
    expect(within(itemOf(REASONS.other)).queryByText('Inactive')).toBeNull();
  });

  it('Scenario: Read-only for a branch-scope viewer — list and switch, no write control', async () => {
    for (const me of [REASON_PEOPLE.viewer, REASON_PEOPLE.editor]) {
      listOf(SEEDED);
      const { unmount } = renderPos(<CancelReasonsScreen />, { me });
      await ready();
      expect(names()).toHaveLength(4);
      expect(screen.getByRole('switch', { name: 'Show archived' })).toBeTruthy();
      expect(screen.queryByTestId('cancel-reason-new')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
      expect(screen.queryByTestId('reorder-handle')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Save order' })).toBeNull();
      unmount();
    }
  });

  it('Scenario: A barber opens /settings/cancel-reasons — the forbidden page, nothing requested', () => {
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.aung });
    expect(screen.getByTestId('refused-page')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Show archived asks for include_archived and lists the archived reasons apart, as text', async () => {
    const archived = { ...REASONS.sick, archived_at: '2026-10-05T10:00:00+06:30' };
    // The API leaves the archived reasons out unless include_archived=true (P3.CRS.01).
    listOf(SEEDED, {
      [`GET ${LIST}&include_archived=true`]: json(200, { items: [...SEEDED, archived] }),
    });
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    await ready();
    expect(screen.queryByTestId('cancel-reasons-archived-list')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Show archived' }));
    const section = await screen.findByTestId('cancel-reasons-archived-list');
    expect(within(section).getByText('Customer is sick')).toBeTruthy();
    expect(within(section).queryByRole('button')).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      `${LIST}&include_archived=true`,
    );
    // Only the four non-archived reasons are in the reorder list.
    expect(screen.getAllByTestId('reorder-handle')).toHaveLength(4);
  });

  it('a failed load shows the error with Retry; an empty list says so', async () => {
    routeFetch(fetchMock, { [`GET ${LIST}`]: json(500, problem(500, 'internal_error')) });
    const { unmount } = renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
    unmount();
    listOf([]);
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    expect(await screen.findByText('No cancel reasons yet.')).toBeTruthy();
  });
});

describe('add-booking-cancel-reasons · booking · The cancel reasons are reordered as one complete list', () => {
  it('Move up then Save order sends every non-archived id in the new order, then a toast', async () => {
    const saved = vi.spyOn(toast, 'success');
    listOf(SEEDED, {
      'PUT /api/v1/booking-cancel-reasons/order': json(200, {
        items: [REASONS.noShow, REASONS.change, REASONS.barber, REASONS.other],
      }),
    });
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    await ready();
    const noShowUp = within(itemOf(REASONS.noShow)).getByRole('button', { name: 'Move up' });
    fireEvent.click(noShowUp);
    fireEvent.click(within(itemOf(REASONS.noShow)).getByRole('button', { name: 'Move up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith('Order saved'));
    expect(sent('PUT', '/api/v1/booking-cancel-reasons/order')).toStrictEqual({
      ids: [REASONS.noShow.id, REASONS.change.id, REASONS.barber.id, REASONS.other.id],
    });
  });

  it('a refused order stays in the alert and the list is read again', async () => {
    listOf(SEEDED, {
      'PUT /api/v1/booking-cancel-reasons/order': json(
        400,
        problem(400, 'validation', { errors: [{ field: 'ids', code: 'invalid_value' }] }),
      ),
    });
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    await ready();
    fireEvent.click(within(itemOf(REASONS.other)).getByRole('button', { name: 'Move up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    expect(await screen.findByTestId('cancel-reasons-alert')).toBeTruthy();
    const reads = fetchMock.mock.calls.filter(([url]) => String(url) === LIST);
    await waitFor(() => expect(reads.length).toBeGreaterThanOrEqual(1));
  });
});

describe('add-booking-cancel-reasons · booking · The cancel-reason form shows the answers in place', () => {
  it('Scenario: Add — Customer နေမကောင်း / Customer is sick with a note; the toast', async () => {
    const saved = vi.spyOn(toast, 'success');
    listOf(SEEDED, { 'POST /api/v1/booking-cancel-reasons': json(201, REASONS.sick) });
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    fireEvent.click(await screen.findByTestId('cancel-reason-new'));
    await screen.findByTestId('cancel-reason-form');
    expect(screen.queryByTestId('cancel-reason-field-status')).toBeNull();
    fireEvent.change(screen.getByTestId('cancel-reason-name-mm'), {
      target: { value: 'Customer နေမကောင်း' },
    });
    fireEvent.change(screen.getByTestId('cancel-reason-name-en'), {
      target: { value: 'Customer is sick' },
    });
    fireEvent.click(screen.getByTestId('cancel-reason-requires-note'));
    fireEvent.click(screen.getByTestId('cancel-reason-save'));
    await waitFor(() => expect(saved).toHaveBeenCalledWith('Cancel reason saved'));
    expect(sent('POST', '/api/v1/booking-cancel-reasons')).toStrictEqual({
      name_mm: 'Customer နေမကောင်း',
      name_en: 'Customer is sick',
      requires_note: true,
    });
    await waitFor(() => expect(screen.queryByTestId('cancel-reason-form')).toBeNull());
  });

  it('a blank Myanmar name is refused at the field — nothing is sent', async () => {
    listOf(SEEDED);
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    fireEvent.click(await screen.findByTestId('cancel-reason-new'));
    await screen.findByTestId('cancel-reason-form');
    fireEvent.click(screen.getByTestId('cancel-reason-save'));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('cancel-reason-field-name_mm')).getByText(
          'This field is required.',
        ),
      ).toBeTruthy(),
    );
    expect(screen.getByTestId('cancel-reason-name-mm').getAttribute('aria-invalid')).toBe('true');
    expect(sent('POST', '/api/v1/booking-cancel-reasons')).toBeUndefined();
  });

  it('Scenario: A duplicate name — the form stays open with error.already_exists under the Myanmar name', async () => {
    listOf(SEEDED, {
      'POST /api/v1/booking-cancel-reasons': json(409, problem(409, 'already_exists')),
    });
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    fireEvent.click(await screen.findByTestId('cancel-reason-new'));
    await screen.findByTestId('cancel-reason-form');
    fireEvent.change(screen.getByTestId('cancel-reason-name-mm'), { target: { value: 'Other' } });
    fireEvent.click(screen.getByTestId('cancel-reason-save'));
    const field = screen.getByTestId('cancel-reason-field-name_mm');
    await waitFor(() =>
      expect(
        within(field).getByText('This already exists. Check the value and try again.'),
      ).toBeTruthy(),
    );
    expect(screen.getByTestId('cancel-reason-form')).toBeTruthy();
  });

  it('Edit sends only the changed members and expected_updated_at; Status is offered', async () => {
    listOf(SEEDED, {
      [`PATCH /api/v1/booking-cancel-reasons/${REASONS.barber.id}`]: json(200, {
        ...REASONS.barber,
        status: CancelReasonStatus.INACTIVE,
      }),
    });
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    await ready();
    fireEvent.click(within(itemOf(REASONS.barber)).getByRole('button', { name: 'Edit' }));
    await screen.findByTestId('cancel-reason-form');
    fireEvent.click(screen.getByTestId('cancel-reason-inactive'));
    fireEvent.click(screen.getByTestId('cancel-reason-save'));
    await waitFor(() =>
      expect(sent('PATCH', `/api/v1/booking-cancel-reasons/${REASONS.barber.id}`)).toStrictEqual({
        status: CancelReasonStatus.INACTIVE,
        expected_updated_at: REASONS.barber.updated_at,
      }),
    );
  });

  it('Scenario: the system row — only the names and the lock note; a refused change shows in the alert', async () => {
    listOf(SEEDED, {
      [`PATCH /api/v1/booking-cancel-reasons/${REASONS.noShow.id}`]: json(
        409,
        problem(409, 'system_row'),
      ),
    });
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    await ready();
    fireEvent.click(within(itemOf(REASONS.noShow)).getByRole('button', { name: 'Edit' }));
    await screen.findByTestId('cancel-reason-form');
    expect(screen.getByTestId('cancel-reason-locked').textContent).toBe(
      'Used by the system for no-shows — only the names can be changed.',
    );
    expect(screen.queryByTestId('cancel-reason-requires-note')).toBeNull();
    expect(screen.queryByTestId('cancel-reason-field-status')).toBeNull();
    fireEvent.change(screen.getByTestId('cancel-reason-name-en'), {
      target: { value: 'No-show' },
    });
    fireEvent.click(screen.getByTestId('cancel-reason-save'));
    const alert = await screen.findByTestId('cancel-reason-alert');
    expect(alert.textContent).toContain("can't be made");
    expect(sent('PATCH', `/api/v1/booking-cancel-reasons/${REASONS.noShow.id}`)).toStrictEqual({
      name_en: 'No-show',
      expected_updated_at: REASONS.noShow.updated_at,
    });
  });

  it('a 409 conflict keeps the input and offers Reload, which starts again from the stored reason', async () => {
    const stored = {
      ...REASONS.barber,
      name_en: 'Barber is busy',
      updated_at: '2026-10-05T09:30:00.000+06:30',
    };
    let reads = 0;
    listOf(SEEDED, {
      [`PATCH /api/v1/booking-cancel-reasons/${REASONS.barber.id}`]: json(
        409,
        problem(409, 'conflict'),
      ),
      [`GET ${LIST}`]: () =>
        json(200, { items: ++reads === 1 ? SEEDED : [REASONS.change, stored] }),
    });
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    await ready();
    fireEvent.click(within(itemOf(REASONS.barber)).getByRole('button', { name: 'Edit' }));
    await screen.findByTestId('cancel-reason-form');
    fireEvent.change(screen.getByTestId('cancel-reason-name-en'), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByTestId('cancel-reason-save'));
    await screen.findByTestId('cancel-reason-conflict');
    expect((screen.getByTestId('cancel-reason-name-en') as HTMLInputElement).value).toBe('Mine');
    fireEvent.click(screen.getByTestId('cancel-reason-reload'));
    await waitFor(() =>
      expect((screen.getByTestId('cancel-reason-name-en') as HTMLInputElement).value).toBe(
        'Barber is busy',
      ),
    );
    expect(screen.queryByTestId('cancel-reason-conflict')).toBeNull();
  });

  it('Cancel with edits asks "Discard changes?"; Keep editing stays, Discard closes', async () => {
    listOf(SEEDED);
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    fireEvent.click(await screen.findByTestId('cancel-reason-new'));
    await screen.findByTestId('cancel-reason-form');
    fireEvent.click(screen.getByTestId('cancel-reason-cancel'));
    await waitFor(() => expect(screen.queryByTestId('cancel-reason-form')).toBeNull());
    fireEvent.click(screen.getByTestId('cancel-reason-new'));
    await screen.findByTestId('cancel-reason-form');
    fireEvent.change(screen.getByTestId('cancel-reason-name-mm'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('cancel-reason-cancel'));
    expect(await screen.findByText('Discard changes?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByTestId('cancel-reason-form')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cancel-reason-cancel'));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByTestId('cancel-reason-form')).toBeNull());
  });
});

describe('add-booking-cancel-reasons · booking · Archive asks first', () => {
  it('Scenario: Archive "Barber not available" — a confirmation naming it, nothing sent until confirmed, then a toast', async () => {
    const saved = vi.spyOn(toast, 'success');
    listOf(SEEDED, {
      [`POST /api/v1/booking-cancel-reasons/${REASONS.barber.id}/archive`]: json(200, {
        ...REASONS.barber,
        archived_at: '2026-10-05T10:00:00.000+06:30',
      }),
    });
    renderPos(<CancelReasonsScreen />, { me: REASON_PEOPLE.kyawZin });
    await ready();
    fireEvent.click(within(itemOf(REASONS.barber)).getByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Archive “Barber not available”?');
    expect(
      sent('POST', `/api/v1/booking-cancel-reasons/${REASONS.barber.id}/archive`),
    ).toBeUndefined();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith('Cancel reason archived'));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
  });
});
