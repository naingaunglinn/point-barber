// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@point/i18n';
import type { MeResponse } from '@point/shared';

import { settingsKeys } from '../../../../../lib/settings/settings.keys';
import { renderPos, routeFetch } from '../../../../../test/pos-render';
import { json, problem } from '../../../../../test/render';
import {
  KYAW_ZIN_REF,
  koAungMe,
  kyawZinMe,
  listOf,
  maHninMe,
} from '../../../../../test/settings-fixtures';

// add-settings-store tasks 5.4 – 5.7 and 5.9 — settings spec "The Additional settings screen" and "The
// impact note before saving, and the history link" (AD-SET-01 · AD-SET-03 · AD-FORM-02 – 04 · AD-CONF-01 ·
// AD-TOAST-01 · owner SS1 / SS3 = C / SS4 · design D10) on the fixture data: the groups and rows of the
// company view, a control per type or the value as text, the API's schema before sending, the server's
// errors on the field, the impact note's confirm step.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/settings/additional',
  useSearchParams: () => new URLSearchParams(),
}));
const { AdditionalSettingsScreen } = await import('./additional-settings-screen');

const LIST = 'GET /api/v1/settings';
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const puts = () =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([url, init]) => [String(url), JSON.parse(String(init?.body)) as unknown]);

/** The rows most tests look at; "The admin sees every group" renders every key. */
const SOME = [
  'booking.slot_interval_minutes',
  'booking.advance_window_days',
  'home_service.transport_fee_amount',
  'receipt.auto_print',
  'receipt.printer_width_mm',
  'receipt.thank_you_text',
  'closing.cash_difference_tolerance_amount',
] as const;
const READ_ONLY = [
  'sales.tax_enabled',
  'sales.service_charge_enabled',
  'system.maintenance',
] as const;

function open(me: MeResponse, list = listOf({ only: SOME }), locale: Locale = 'en', extra = {}) {
  routeFetch(fetchMock, { [LIST]: json(200, list), ...extra });
  return renderPos(<AdditionalSettingsScreen />, { me, locale });
}
const row = (key: string) => screen.getByTestId(`setting-${key}-row`);

/** The open confirm step, found without scanning every role of the page; its title is checked. */
async function confirmStep(title: string): Promise<HTMLElement> {
  let found: HTMLElement | null = null;
  await waitFor(() => {
    found = document.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(found).not.toBeNull();
  });
  const dialog = found as unknown as HTMLElement;
  expect(within(dialog).getByText(title)).toBeTruthy();
  return dialog;
}
const noConfirmStep = () => expect(document.querySelector('[role="alertdialog"]')).toBeNull();

describe('add-settings-store · settings · The Additional settings screen', () => {
  it('Scenario: The admin sees every group', async () => {
    open(kyawZinMe(), listOf());
    await screen.findByTestId('settings-group-system');
    const groups = [...document.querySelectorAll('[data-testid^="settings-group-"] > h2')];
    expect(groups.map((heading) => heading.textContent)).toStrictEqual([
      'Booking',
      'Sales & payments',
      'Closing',
      'Payroll & attendance',
      'Dashboard',
      'System',
    ]);
    const slot = within(row('booking.slot_interval_minutes'));
    expect(slot.getAllByRole('radio')).toHaveLength(4);
    expect(
      ['5 min', '10 min', '15 min', '30 min'].map((name) =>
        slot.getByRole('radio', { name }).getAttribute('aria-checked'),
      ),
    ).toStrictEqual(['false', 'false', 'true', 'false']);
    expect(slot.getByTestId('setting-booking.slot_interval_minutes-source').textContent).toBe(
      'Default',
    );
    expect(slot.getByText('Slot interval')).toBeTruthy();
    expect(
      slot.getByText(
        'Booking start times are offered at this step, e.g. 15 min: 10:00 AM, 10:15 AM.',
      ),
    ).toBeTruthy();
  });

  it('Scenario: A barber has no settings — the no-access page and no value is loaded', async () => {
    open(koAungMe());
    expect(await screen.findByTestId('refused-page')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Scenario: A manager sees company values read-only — no control and no Save', async () => {
    open(maHninMe(), listOf({ editable: false, only: SOME }));
    for (const [key, text] of [
      ['booking.slot_interval_minutes', '15 min'],
      ['booking.advance_window_days', '14 days'],
      ['closing.cash_difference_tolerance_amount', '0 Ks'],
    ] as const) {
      const shown = within(await screen.findByTestId(`setting-${key}-row`));
      expect(shown.getByTestId(`setting-${key}-value`).textContent).toBe(text);
      expect(shown.queryByRole('radio')).toBeNull();
      expect(shown.queryByRole('textbox')).toBeNull();
      expect(shown.queryByRole('button', { name: 'Save' })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('Scenario: An invalid value is not sent — an empty tolerance shows its message, no request', async () => {
    open(kyawZinMe());
    const tolerance = within(
      await screen.findByTestId('setting-closing.cash_difference_tolerance_amount-row'),
    );
    const input = tolerance.getByRole('textbox', { name: /Cash difference tolerance/ });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(tolerance.getByRole('button', { name: 'Save' }));
    expect(await tolerance.findByText('This field is required.')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(puts()).toStrictEqual([]);
  });

  it('a minus sign cannot be typed into money (AD-FORM-11): "-1" is 1', async () => {
    open(kyawZinMe());
    const tolerance = within(
      await screen.findByTestId('setting-closing.cash_difference_tolerance_amount-row'),
    );
    const input = tolerance.getByRole('textbox', {
      name: /Cash difference tolerance/,
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-1' } });
    expect(input.value).toBe('1');
  });

  it.each([
    ['en', '2,000 Ks'],
    ['my', '2,000 ကျပ်'],
  ] as const)('Scenario: Money in both languages — %s reads %s', async (locale, text) => {
    open(
      maHninMe(locale === 'en' ? 2 : 1),
      listOf({
        editable: false,
        only: SOME,
        items: {
          'home_service.transport_fee_amount': {
            company_value: 2000,
            effective: 2000,
            source: 'company',
          },
        },
      }),
      locale,
    );
    expect(
      (await screen.findByTestId('setting-home_service.transport_fee_amount-value')).textContent,
    ).toBe(text);
  });
});

describe('controls per type (task 5.5)', () => {
  it('money, a number with its unit, a switch, a choice and the thank-you pair with its helper', async () => {
    open(kyawZinMe());
    const fee = within(await screen.findByTestId('setting-home_service.transport_fee_amount-row'));
    expect((fee.getByRole('textbox') as HTMLInputElement).value).toBe('0');
    expect(fee.getByText('Ks')).toBeTruthy();
    const window = within(row('booking.advance_window_days'));
    expect((window.getByRole('textbox') as HTMLInputElement).value).toBe('14');
    expect(window.getByText('days')).toBeTruthy();
    expect(
      within(row('receipt.auto_print'))
        .getByRole('switch', { name: 'Print receipts automatically' })
        .getAttribute('aria-checked'),
    ).toBe('false');
    const width = within(row('receipt.printer_width_mm'));
    expect(width.getAllByRole('radio')).toHaveLength(2);
    expect(width.getByRole('radio', { name: '58 mm' }).getAttribute('aria-checked')).toBe('true');
    expect(width.getByRole('radio', { name: '80 mm' })).toBeTruthy();
    const thanks = within(row('receipt.thank_you_text'));
    expect(thanks.getByRole('textbox', { name: /Myanmar/ })).toBeTruthy();
    expect(thanks.getByRole('textbox', { name: /English/ })).toBeTruthy();
    expect(
      thanks.getByText(
        'Only the English text is printed on receipts. Leave English empty for no line.',
      ),
    ).toBeTruthy();
  });

  it('the Myanmar screen: labels, units and choices from the Myanmar file', async () => {
    open(kyawZinMe(1), listOf({ only: SOME }), 'my');
    const slot = within(await screen.findByTestId('setting-booking.slot_interval_minutes-row'));
    expect(slot.getByText('အချိန်ကွက်')).toBeTruthy();
    expect(slot.getByRole('radio', { name: '15 မိနစ်' }).getAttribute('aria-checked')).toBe('true');
    expect(within(row('booking.advance_window_days')).getByText('ရက်')).toBeTruthy();
    expect(within(row('home_service.transport_fee_amount')).getByText('ကျပ်')).toBeTruthy();
  });
});

describe('saving (task 5.6)', () => {
  it('Scenario: No note — the auto-print switch saves at once and a success toast appears', async () => {
    open(kyawZinMe(), listOf({ only: SOME }), 'en', {
      'PUT /api/v1/settings/receipt.auto_print': json(200, {}),
    });
    const autoPrint = within(await screen.findByTestId('setting-receipt.auto_print-row'));
    fireEvent.click(autoPrint.getByRole('switch'));
    fireEvent.click(autoPrint.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(puts()).toStrictEqual([['/api/v1/settings/receipt.auto_print', { value: true }]]),
    );
    noConfirmStep();
  });

  it('a field error of the server is shown under the field', async () => {
    open(kyawZinMe(), listOf({ only: SOME }), 'en', {
      'PUT /api/v1/settings/booking.advance_window_days': json(
        400,
        problem(400, 'validation', {
          errors: [{ field: 'value', code: 'too_small', params: { minimum: 0 } }],
        }),
      ),
    });
    const window = within(await screen.findByTestId('setting-booking.advance_window_days-row'));
    fireEvent.change(window.getByRole('textbox'), { target: { value: '7' } });
    fireEvent.click(window.getByRole('button', { name: 'Save' }));
    // The advance window has an impact note: confirm it.
    const dialog = await confirmStep('Change to 7 days?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await window.findByText('This value is too short or too small — minimum 0.'),
    ).toBeTruthy();
  });

  it('a refusal that names no field is shown at the top of the row', async () => {
    open(kyawZinMe(), listOf({ only: SOME }), 'en', {
      'PUT /api/v1/settings/receipt.auto_print': json(400, problem(400, 'setting_scope')),
    });
    const autoPrint = within(await screen.findByTestId('setting-receipt.auto_print-row'));
    fireEvent.click(autoPrint.getByRole('switch'));
    fireEvent.click(autoPrint.getByRole('button', { name: 'Save' }));
    expect((await autoPrint.findByRole('alert')).textContent).toContain(
      "This setting can't be changed here.",
    );
  });

  it('the thank-you text: English only is refused before sending — Myanmar is required when set', async () => {
    open(kyawZinMe());
    const thanks = within(await screen.findByTestId('setting-receipt.thank_you_text-row'));
    fireEvent.change(thanks.getByRole('textbox', { name: /English/ }), {
      target: { value: 'Thank you!' },
    });
    fireEvent.click(thanks.getByRole('button', { name: 'Save' }));
    expect(await thanks.findByText('This field is required.')).toBeTruthy();
    expect(puts()).toStrictEqual([]);
  });
});

describe('read-only rows (task 5.7)', () => {
  it('Scenario: The tax switch stays off — tax and service charge shown Off without a control', async () => {
    open(kyawZinMe(), listOf({ only: READ_ONLY }));
    for (const key of ['sales.tax_enabled', 'sales.service_charge_enabled']) {
      const shown = within(await screen.findByTestId(`setting-${key}-row`));
      expect(shown.getByTestId(`setting-${key}-value`).textContent).toBe('Off');
      expect(shown.queryByRole('switch')).toBeNull();
      expect(shown.queryByRole('button', { name: 'Save' })).toBeNull();
    }
  });

  it('system.maintenance shows its state and, for company-scope settings.update, a link to Maintenance mode', async () => {
    open(kyawZinMe(), listOf({ only: READ_ONLY }));
    const maintenance = within(await screen.findByTestId('setting-system.maintenance-row'));
    expect(maintenance.getByTestId('setting-system.maintenance-value').textContent).toBe('Off');
    expect(maintenance.getByRole('link', { name: 'Maintenance mode' }).getAttribute('href')).toBe(
      '/settings/maintenance',
    );
  });

  it('a manager sees the maintenance state without the link', async () => {
    open(maHninMe(), listOf({ editable: false, only: READ_ONLY }));
    const maintenance = within(await screen.findByTestId('setting-system.maintenance-row'));
    expect(maintenance.queryByRole('link')).toBeNull();
  });
});

describe('add-settings-store · settings · The impact note before saving, and the history link', () => {
  it('Scenario: The impact note — 15 → 30 min asks first; Cancel sends nothing, Confirm sends 30', async () => {
    open(kyawZinMe(), listOf({ only: SOME }), 'en', {
      'PUT /api/v1/settings/booking.slot_interval_minutes': json(200, {}),
    });
    const slot = within(await screen.findByTestId('setting-booking.slot_interval_minutes-row'));
    fireEvent.click(slot.getByRole('radio', { name: '30 min' }));
    fireEvent.click(slot.getByRole('button', { name: 'Save' }));
    let dialog = await confirmStep('Change to 30 min?');
    expect(
      within(dialog).getByText(
        'Applies to new bookings from now; existing bookings keep their times',
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Go back' }));
    await waitFor(noConfirmStep);
    expect(puts()).toStrictEqual([]);
    fireEvent.click(slot.getByRole('button', { name: 'Save' }));
    dialog = await confirmStep('Change to 30 min?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(puts()).toStrictEqual([
        ['/api/v1/settings/booking.slot_interval_minutes', { value: 30 }],
      ]),
    );
  });

  it('Scenario: The transport fee asks first — U Kyaw Zin confirms 2,000 for the company', async () => {
    open(kyawZinMe(), listOf({ only: SOME }), 'en', {
      'PUT /api/v1/settings/home_service.transport_fee_amount': json(200, {
        updated_by: KYAW_ZIN_REF,
      }),
    });
    const fee = within(await screen.findByTestId('setting-home_service.transport_fee_amount-row'));
    fireEvent.change(fee.getByRole('textbox'), { target: { value: '2000' } });
    fireEvent.click(fee.getByRole('button', { name: 'Save' }));
    const dialog = await confirmStep('Change to 2,000 Ks?');
    expect(
      within(dialog).getByText(
        'Applies to new home-service bookings and visits from now; existing bookings keep their transport fee.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(puts()).toStrictEqual([
        ['/api/v1/settings/home_service.transport_fee_amount', { value: 2000 }],
      ]),
    );
  });

  it('the tolerance and the advance window ask first too', async () => {
    open(kyawZinMe());
    const tolerance = within(
      await screen.findByTestId('setting-closing.cash_difference_tolerance_amount-row'),
    );
    fireEvent.change(tolerance.getByRole('textbox'), { target: { value: '500' } });
    fireEvent.click(tolerance.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Applies to closings from now; closed days keep their result.'),
    ).toBeTruthy();
  });
});

// Review of #48: TanStack Query keeps `data` when a background refetch fails but sets `isError`, so the
// error state comes only while nothing was loaded; and a Save that gets no answer at all (no network —
// not an ApiProblem) is shown, and closes the impact step (CG-ERR-01).
describe('a failed load in the background, and a Save with no answer', () => {
  const NO_ANSWER = 'Something went wrong. Try again.';
  const offline = () => Promise.reject(new TypeError('Failed to fetch'));

  it('a failed load in the background (window focus) keeps the rows and what was typed', async () => {
    let loads = 0;
    const { client } = open(kyawZinMe(), listOf({ only: SOME }), 'en', {
      [LIST]: () => {
        loads += 1;
        return loads === 1
          ? json(200, listOf({ only: SOME }))
          : json(500, problem(500, 'internal_error'));
      },
    });
    const advance = within(await screen.findByTestId('setting-booking.advance_window_days-row'));
    fireEvent.change(advance.getByRole('textbox'), { target: { value: '7' } });
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() =>
      expect(client.getQueryState(settingsKeys.list(undefined))?.status).toBe('error'),
    );
    expect(loads).toBe(2);
    expect(
      (within(row('booking.advance_window_days')).getByRole('textbox') as HTMLInputElement).value,
    ).toBe('7');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('a Save with no answer shows the error, and the impact step closes', async () => {
    open(kyawZinMe(), listOf({ only: SOME }), 'en', {
      'PUT /api/v1/settings/home_service.transport_fee_amount': offline,
      'PUT /api/v1/settings/receipt.auto_print': offline,
    });
    const fee = within(await screen.findByTestId('setting-home_service.transport_fee_amount-row'));
    fireEvent.change(fee.getByRole('textbox'), { target: { value: '2000' } });
    fireEvent.click(fee.getByRole('button', { name: 'Save' }));
    const dialog = await confirmStep('Change to 2,000 Ks?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect((await fee.findByRole('alert')).textContent).toContain(NO_ANSWER);
    await waitFor(noConfirmStep);
    // A key without an impact note says it too.
    const autoPrint = within(row('receipt.auto_print'));
    fireEvent.click(autoPrint.getByRole('switch'));
    fireEvent.click(autoPrint.getByRole('button', { name: 'Save' }));
    expect((await autoPrint.findByRole('alert')).textContent).toContain(NO_ANSWER);
  });
});
