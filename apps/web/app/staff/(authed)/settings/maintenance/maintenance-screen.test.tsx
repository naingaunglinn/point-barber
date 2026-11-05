// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatTime, mmtInstant, type SystemStatus } from '@point/shared';

import { settingsKeys } from '../../../../../lib/settings/settings.keys';
import { renderPos, routeFetch } from '../../../../../test/pos-render';
import { json, problem } from '../../../../../test/render';
import { kyawZinMe, maHninMe } from '../../../../../test/settings-fixtures';

// add-settings-store task 6.1 — settings spec "The Maintenance mode screen and the admin banner"
// (AD-NAV-08 · D-PLT-08 · P1.SYS.03 · owner SS2 · design D10): the switch, the expected end, the two
// messages, Save → `PUT /v1/system/maintenance` and its toast; the API's body schema before sending; the
// screen only for company-scope settings.update.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/settings/maintenance',
  useSearchParams: () => new URLSearchParams(),
}));
const { MaintenanceScreen } = await import('./maintenance-screen');

const STATUS = 'GET /api/v1/system/status';
const SET = 'PUT /api/v1/system/maintenance';
const status = (overrides: Partial<SystemStatus> = {}): SystemStatus => ({
  maintenance: false,
  until: null,
  message_mm: null,
  message_en: null,
  version: '0.1.0',
  server_time: '2026-10-05T21:00:00+06:30',
  ...overrides,
});

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const sent = () =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([, init]) => JSON.parse(String(init?.body)) as unknown);

/** The expected end as a person sets it: the date typed, the time chosen in its combobox. */
function setUntil(date: string, time: string) {
  const field = screen.getByTestId('maintenance-until');
  const input = within(field).getByRole('textbox', { name: 'Expected end — Date' });
  fireEvent.change(input, { target: { value: date } });
  fireEvent.blur(input);
  fireEvent.click(within(field).getByTestId('maintenance-until-time'));
  fireEvent.change(screen.getByPlaceholderText('Search'), {
    target: { value: formatTime(mmtInstant('2026-01-01', time), { locale: 'en' }) },
  });
  fireEvent.click(screen.getByTestId(`maintenance-until-time-${time}`));
}

describe('add-settings-store · settings · The Maintenance mode screen and the admin banner', () => {
  it('Scenario: The admin turns it on — switch, expected end 05/Oct/2026 10:00 PM, "Server update"', async () => {
    routeFetch(fetchMock, {
      [STATUS]: json(200, status()),
      [SET]: (init) =>
        json(200, status({ maintenance: true, ...(JSON.parse(String(init?.body)) as object) })),
    });
    renderPos(<MaintenanceScreen />, { me: kyawZinMe() });
    expect(
      await screen.findByText(
        "While it's on, only company-wide admins can work. Everyone else sees a notice.",
      ),
    ).toBeTruthy();
    const toggle = await screen.findByRole('switch', { name: 'Maintenance mode' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    setUntil('05/Oct/2026', '22:00');
    fireEvent.change(screen.getByRole('textbox', { name: /English/ }), {
      target: { value: 'Server update' },
    });
    fireEvent.click(screen.getByTestId('maintenance-save'));
    await waitFor(() =>
      expect(sent()).toStrictEqual([
        {
          enabled: true,
          until: '2026-10-05T22:00:00+06:30',
          message_mm: null,
          message_en: 'Server update',
        },
      ]),
    );
  });

  it('Scenario: A manager has no maintenance screen — the no-access page, nothing loaded', async () => {
    renderPos(<MaintenanceScreen />, { me: maHninMe() });
    expect(await screen.findByTestId('refused-page')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Scenario: The banner goes when it is off — Save with the switch OFF sends { enabled: false }', async () => {
    routeFetch(fetchMock, {
      [STATUS]: json(
        200,
        status({
          maintenance: true,
          until: '2026-10-05T22:00:00+06:30',
          message_en: 'Server update',
        }),
      ),
      [SET]: json(200, status()),
    });
    renderPos(<MaintenanceScreen />, { me: kyawZinMe() });
    const toggle = await screen.findByRole('switch', { name: 'Maintenance mode' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    // The stored values are shown: the expected end and the English message.
    expect((screen.getByRole('textbox', { name: /English/ }) as HTMLInputElement).value).toBe(
      'Server update',
    );
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId('maintenance-save'));
    await waitFor(() => expect(sent()).toStrictEqual([{ enabled: false }]));
    // The form starts again from the stored values: OFF, and the message the save cleared is gone.
    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: /English/ }) as HTMLInputElement).value).toBe(''),
    );
    expect(
      screen.getByRole('switch', { name: 'Maintenance mode' }).getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('a message of 201 characters is refused before sending (owner SS2)', async () => {
    routeFetch(fetchMock, { [STATUS]: json(200, status()) });
    renderPos(<MaintenanceScreen />, { me: kyawZinMe() });
    fireEvent.click(await screen.findByRole('switch', { name: 'Maintenance mode' }));
    fireEvent.change(screen.getByRole('textbox', { name: /English/ }), {
      target: { value: 'e'.repeat(201) },
    });
    fireEvent.click(screen.getByTestId('maintenance-save'));
    expect(
      await screen.findByText('This value is too long or too large — maximum 200.'),
    ).toBeTruthy();
    expect(sent()).toStrictEqual([]);
  });

  it('a date without a time asks for the time; nothing is sent', async () => {
    routeFetch(fetchMock, { [STATUS]: json(200, status()) });
    renderPos(<MaintenanceScreen />, { me: kyawZinMe() });
    fireEvent.click(await screen.findByRole('switch', { name: 'Maintenance mode' }));
    const input = within(screen.getByTestId('maintenance-until')).getByRole('textbox', {
      name: 'Expected end — Date',
    });
    fireEvent.change(input, { target: { value: '05/Oct/2026' } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByTestId('maintenance-save'));
    expect(await screen.findByText('This field is required.')).toBeTruthy();
    expect(sent()).toStrictEqual([]);
  });
});

// Review of #48: a failed background refetch keeps the form; a Save with no answer (no network) is
// shown (CG-ERR-01); OFF sends only `{ enabled: false }`, so the expected end and the messages are not
// checked then.
describe('Maintenance mode: a failed load in the background, a Save with no answer, OFF', () => {
  it('a failed load in the background (window focus) keeps the form and what was typed', async () => {
    let loads = 0;
    routeFetch(fetchMock, {
      [STATUS]: () => {
        loads += 1;
        return loads === 1 ? json(200, status()) : json(500, problem(500, 'internal_error'));
      },
    });
    const { client } = renderPos(<MaintenanceScreen />, { me: kyawZinMe() });
    await screen.findByRole('switch', { name: 'Maintenance mode' });
    fireEvent.change(screen.getByRole('textbox', { name: /English/ }), {
      target: { value: 'Server update' },
    });
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() =>
      expect(client.getQueryState(settingsKeys.systemStatus)?.status).toBe('error'),
    );
    expect(loads).toBe(2);
    expect((screen.getByRole('textbox', { name: /English/ }) as HTMLInputElement).value).toBe(
      'Server update',
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('a Save with no answer shows the error', async () => {
    routeFetch(fetchMock, {
      [STATUS]: json(200, status()),
      [SET]: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    renderPos(<MaintenanceScreen />, { me: kyawZinMe() });
    fireEvent.click(await screen.findByRole('switch', { name: 'Maintenance mode' }));
    fireEvent.click(screen.getByTestId('maintenance-save'));
    const form = within(screen.getByTestId('maintenance-form'));
    expect((await form.findByRole('alert')).textContent).toContain(
      'Something went wrong. Try again.',
    );
  });

  it('OFF with a date and no time and a long message sends { enabled: false } — neither is checked', async () => {
    routeFetch(fetchMock, { [STATUS]: json(200, status()), [SET]: json(200, status()) });
    renderPos(<MaintenanceScreen />, { me: kyawZinMe() });
    await screen.findByRole('switch', { name: 'Maintenance mode' });
    const input = within(screen.getByTestId('maintenance-until')).getByRole('textbox', {
      name: 'Expected end — Date',
    });
    fireEvent.change(input, { target: { value: '05/Oct/2026' } });
    fireEvent.blur(input);
    fireEvent.change(screen.getByRole('textbox', { name: /English/ }), {
      target: { value: 'e'.repeat(201) },
    });
    fireEvent.click(screen.getByTestId('maintenance-save'));
    await waitFor(() => expect(sent()).toStrictEqual([{ enabled: false }]));
    expect(screen.queryByText('This field is required.')).toBeNull();
  });
});
