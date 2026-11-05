// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeResponse, SettingView } from '@point/shared';

import { renderPos, routeFetch, type Route } from '../../../../../test/pos-render';
import { json } from '../../../../../test/render';
import {
  KYAW_ZIN_REF,
  SETTINGS_IDS,
  kyawZinMe,
  listOf,
  maHninMe,
} from '../../../../../test/settings-fixtures';

// add-settings-store tasks 5.8 – 5.10 — settings spec "Branch overrides on the screen" and "The impact
// note before saving, and the history link" (AD-SET-02 · AD-SET-03 · P1.SET.01 / 03 / 04 / 05 · owner
// SS3 = C · design D10): the overrides of a branch key per covered branch with value and badge, editing
// and "Reset to company value", "Reset to default" on a company value, the transport fee's impact note
// in the drawer too, and the history lines newest first with "Load more".
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/settings/additional',
  useSearchParams: () => new URLSearchParams(),
}));
const { AdditionalSettingsScreen } = await import('./additional-settings-screen');

const { B1, B2, B3 } = SETTINGS_IDS;
const FEE = 'home_service.transport_fee_amount';
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const fee = (value: number, source: SettingView['source'], extra: Partial<SettingView> = {}) => ({
  [FEE]: { company_value: 2000, effective: value, source, ...extra },
});
const ROWS = [
  FEE,
  'booking.slot_interval_minutes',
  'booking.advance_window_days',
  'receipt.auto_print',
] as const;
const branchList = (value: number, source: SettingView['source'], editable: boolean) =>
  listOf({
    only: ROWS,
    branch: true,
    editable,
    items: fee(value, source, { branch_value: source === 'branch' ? value : null }),
  });

const sent = (method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([url, init]) => [String(url), JSON.parse(String(init?.body)) as unknown]);

function open(me: MeResponse, routes: Record<string, Route>) {
  routeFetch(fetchMock, {
    'GET /api/v1/settings': json(200, listOf({ only: ROWS, items: fee(2000, 'company') })),
    ...routes,
  });
  return renderPos(<AdditionalSettingsScreen />, { me });
}

/** The drawer's text of one branch: name, value and badge. */
const branchLine = (branchId: string) =>
  screen.getByTestId(`setting-${FEE}-branch-${branchId}`).firstElementChild?.textContent;

describe('add-settings-store · settings · Branch overrides on the screen', () => {
  it('Scenario: The admin sees every branch', async () => {
    open(kyawZinMe(), {
      [`GET /api/v1/settings?branch_id=${B1}`]: json(200, branchList(2000, 'company', true)),
      [`GET /api/v1/settings?branch_id=${B2}`]: json(200, branchList(2000, 'company', true)),
      [`GET /api/v1/settings?branch_id=${B3}`]: json(200, branchList(3000, 'branch', true)),
    });
    fireEvent.click(await screen.findByTestId(`setting-${FEE}-overrides-open`));
    await screen.findByTestId(`setting-${FEE}-branch-${B3}`);
    expect(branchLine(B1)).toBe('Point 1.02,000 KsCompany');
    expect(branchLine(B2)).toBe('Point 2.02,000 KsCompany');
    expect(branchLine(B3)).toBe('Point 3.03,000 KsBranch override');
    expect(screen.getByTestId(`setting-${FEE}-branch-${B3}-reset`).textContent).toBe(
      'Reset to company value',
    );
    expect(screen.queryByTestId(`setting-${FEE}-branch-${B1}-reset`)).toBeNull();
  });

  it('Scenario: A manager sees her branch — only Point 3.0, and its value can be edited', async () => {
    open(maHninMe(), {
      'GET /api/v1/settings': json(
        200,
        listOf({ only: ROWS, editable: false, items: fee(2000, 'company') }),
      ),
      [`GET /api/v1/settings?branch_id=${B3}`]: json(200, branchList(2000, 'company', true)),
    });
    fireEvent.click(await screen.findByTestId(`setting-${FEE}-overrides-open`));
    const b3 = await screen.findByTestId(`setting-${FEE}-branch-${B3}`);
    expect(screen.queryByTestId(`setting-${FEE}-branch-${B1}`)).toBeNull();
    expect(within(b3).getByRole('textbox')).toBeTruthy();
    expect(within(b3).getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('Scenario: A company-only key — the slot interval has no "Override for a branch"', async () => {
    open(kyawZinMe(), {});
    await screen.findByTestId('setting-booking.slot_interval_minutes-row');
    expect(screen.queryByTestId('setting-booking.slot_interval_minutes-overrides-open')).toBeNull();
    expect(screen.getByTestId(`setting-${FEE}-overrides-open`).textContent).toBe(
      'Override for a branch',
    );
  });

  it('Scenario: Reset from the screen — Point 3.0 back to 2,000 Ks Company', async () => {
    let reset = false;
    open(maHninMe(), {
      'GET /api/v1/settings': json(
        200,
        listOf({ only: ROWS, editable: false, items: fee(2000, 'company') }),
      ),
      [`GET /api/v1/settings?branch_id=${B3}`]: () =>
        json(200, reset ? branchList(2000, 'company', true) : branchList(3000, 'branch', true)),
      [`POST /api/v1/settings/${FEE}/reset`]: () => {
        reset = true;
        return json(200, {});
      },
    });
    fireEvent.click(await screen.findByTestId(`setting-${FEE}-overrides-open`));
    fireEvent.click(await screen.findByTestId(`setting-${FEE}-branch-${B3}-reset`));
    await waitFor(() => expect(branchLine(B3)).toBe('Point 3.02,000 KsCompany'));
    expect(sent('POST')).toStrictEqual([[`/api/v1/settings/${FEE}/reset`, { branch_id: B3 }]]);
  });

  it('"Reset to default" on a company value whose source is Company', async () => {
    open(kyawZinMe(), {
      'GET /api/v1/settings': json(
        200,
        listOf({
          only: ROWS,
          items: {
            'booking.slot_interval_minutes': {
              company_value: 30,
              effective: 30,
              source: 'company',
              updated_by: KYAW_ZIN_REF,
              updated_at: '2026-10-05T09:00:00+06:30',
            },
          },
        }),
      ),
      'POST /api/v1/settings/booking.slot_interval_minutes/reset': json(200, {}),
    });
    fireEvent.click(
      await screen.findByTestId('setting-booking.slot_interval_minutes-reset-default'),
    );
    await waitFor(() =>
      expect(sent('POST')).toStrictEqual([
        ['/api/v1/settings/booking.slot_interval_minutes/reset', {}],
      ]),
    );
    // A value at its default offers no reset.
    expect(screen.queryByTestId('setting-booking.advance_window_days-reset-default')).toBeNull();
  });
});

describe('add-settings-store · settings · The impact note before saving, and the history link', () => {
  it("Scenario: The transport fee asks first — Ma Hnin's Point 3.0 3,000: Go back sends nothing", async () => {
    open(maHninMe(), {
      'GET /api/v1/settings': json(
        200,
        listOf({ only: ROWS, editable: false, items: fee(2000, 'company') }),
      ),
      [`GET /api/v1/settings?branch_id=${B3}`]: json(200, branchList(2000, 'company', true)),
    });
    fireEvent.click(await screen.findByTestId(`setting-${FEE}-overrides-open`));
    const b3 = await screen.findByTestId(`setting-${FEE}-branch-${B3}`);
    fireEvent.change(within(b3).getByRole('textbox'), { target: { value: '3000' } });
    fireEvent.click(within(b3).getByRole('button', { name: 'Save' }));
    let dialog: HTMLElement | null = null;
    await waitFor(() => {
      dialog = document.querySelector<HTMLElement>('[role="alertdialog"]');
      expect(dialog).not.toBeNull();
    });
    const step = dialog as unknown as HTMLElement;
    expect(within(step).getByText('Change to 3,000 Ks?')).toBeTruthy();
    expect(
      within(step).getByText(
        'Applies to new home-service bookings and visits from now; existing bookings keep their transport fee.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(step).getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());
    expect(sent('PUT')).toStrictEqual([]);
    expect(branchLine(B3)).toBe('Point 3.02,000 KsCompany');
  });

  it('Scenario: The history — newest first, "U Kyaw Zin · 05/Oct/2026 9:05 AM · 30 min → 15 min"', async () => {
    const path = '/api/v1/settings/booking.slot_interval_minutes/history';
    open(kyawZinMe(), {
      [`GET ${path}`]: json(200, {
        items: [
          {
            id: '0199a3f2-0000-7000-8010-000000000002',
            branch_id: null,
            old_value: 30,
            new_value: 15,
            changed_at: '2026-10-05T09:05:00+06:30',
            changed_by: KYAW_ZIN_REF,
          },
        ],
        next_cursor: 'NEXT',
      }),
      [`GET ${path}?cursor=NEXT`]: json(200, {
        items: [
          {
            id: '0199a3f2-0000-7000-8010-000000000001',
            branch_id: null,
            old_value: null,
            new_value: 30,
            changed_at: '2026-10-05T09:00:00+06:30',
            changed_by: KYAW_ZIN_REF,
          },
        ],
        next_cursor: null,
      }),
    });
    fireEvent.click(
      await screen.findByTestId('setting-booking.slot_interval_minutes-history-open'),
    );
    const lines = await screen.findAllByTestId('setting-history-line');
    expect(lines.map((line) => line.textContent)).toStrictEqual([
      'U Kyaw Zin · 05/Oct/2026 9:05 AM · 30 min → 15 min',
    ]);
    fireEvent.click(screen.getByTestId('setting-history-more'));
    await waitFor(() => expect(screen.getAllByTestId('setting-history-line')).toHaveLength(2));
    expect(screen.getAllByTestId('setting-history-line')[1]?.textContent).toBe(
      'U Kyaw Zin · 05/Oct/2026 9:00 AM · — → 30 min',
    );
    expect(screen.queryByTestId('setting-history-more')).toBeNull();
  });

  it('a value without changes: "No changes yet."', async () => {
    open(kyawZinMe(), {
      'GET /api/v1/settings/receipt.auto_print/history': json(200, {
        items: [],
        next_cursor: null,
      }),
    });
    fireEvent.click(await screen.findByTestId('setting-receipt.auto_print-history-open'));
    expect((await screen.findByTestId('setting-history-empty')).textContent).toBe(
      'No changes yet.',
    );
  });
});
