// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SaleStatus } from '@point/shared';

import {
  keepLateEntryTimes,
  keptLateEntryTimes,
} from '../../../../../components/pos/late-entry-times';
import {
  IDS,
  categoryOf,
  methodOf,
  paymentOf,
  saleOf,
  serviceOf,
  visitOf,
} from '../../../../../test/pos-fixtures';
import { chooseTime } from '../../../../../test/late-entry';
import { type Route, renderPos, routeFetch } from '../../../../../test/pos-render';
import { json, problem } from '../../../../../test/render';

// add-late-entry tasks 4.5 / 4.6 (design D6 · LE-3 ★) — the steps of a late entry on the screen of its
// sale: "Service done", a payment and Finish send the time kept on this device since START; when it is
// missing the step shows that one field, empty and required, first, and sends nothing until it is filled.
// The visit carries the "Late entry" flag. A visit that is not a late entry sends nothing extra.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => `/sales/x`,
  useSearchParams: () => new URLSearchParams(),
}));
const { SaleScreen } = await import('./sale-screen');

const SALE = `GET /api/v1/sales/${IDS.SALE}`;
const VISIT = `GET /api/v1/visits/${IDS.VISIT}`;
const BASE: Record<string, Route> = {
  [`GET /api/v1/services?branch_id=${IDS.B3}&pricing_mode=1&limit=100`]: json(200, {
    items: [serviceOf(IDS.HAIRCUT, 'Haircut', 1)],
    next_cursor: null,
    total: null,
  }),
  'GET /api/v1/service-categories': json(200, { items: [categoryOf()] }),
  'GET /api/v1/payment-methods': json(200, { items: [methodOf('CASH'), methodOf('KBZPAY')] }),
};
const LATE = {
  is_late_entry: true,
  late_entry_reason: 1 as const,
  started_at: '2026-10-04T15:00:00+06:30',
};
const COMPLETED = { status: 2 as const, completed_at: '2026-10-04T15:30:00+06:30' };
const KEPT = {
  completed_at: '2026-10-04T15:30:00+06:30',
  received_at: '2026-10-04T15:35:00+06:30',
  finished_at: '2026-10-04T15:36:00+06:30',
};
const PAID = saleOf({
  paid_amount: 10_000,
  remaining_amount: 0,
  payments: [paymentOf()],
  actions: { ...saleOf().actions, finish: true },
});

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const posts = (path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => init?.method === 'POST' && String(url) === `/api/v1${path}`,
  );
const bodyOf = (call: Parameters<typeof fetch> | undefined) =>
  JSON.parse(String(call?.[1]?.body ?? '{}')) as Record<string, unknown>;

const fillTime = (key: string, label: string, date: string, time: string) => {
  const field = screen.getByTestId(`late-entry-${key}`);
  const input = within(field).getByRole('textbox', { name: `${label} — Date` });
  fireEvent.change(input, { target: { value: date } });
  fireEvent.blur(input);
  chooseTime(key, time);
};

// Each test fills up to four late-entry dates and times (a 288-time combobox each): 4.7–5.1 s in a
// full `pnpm test` on 8 cores against the 5 s default, so these get 10 s (measured on #18, 02/Nov/2026).
describe('"Service done" on a late entry (task 4.5)', { timeout: 10_000 }, () => {
  it('sends the completed time kept on this device; the header shows the Late entry flag', async () => {
    keepLateEntryTimes(IDS.VISIT, KEPT);
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, saleOf()),
      [VISIT]: json(200, visitOf(LATE)),
      [`POST /api/v1/visits/${IDS.VISIT}/complete`]: json(200, visitOf({ ...LATE, ...COMPLETED })),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('visit-done'));
    await screen.findByTestId('checkout');
    expect(bodyOf(posts(`/visits/${IDS.VISIT}/complete`)[0])).toStrictEqual({
      completed_at: KEPT.completed_at,
    });
    expect(within(screen.getByTestId('visit-header')).getByText('Late entry')).toBeTruthy();
  });

  it('Scenario: another device — "Completed time" first, required, then sent', async () => {
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, saleOf()),
      [VISIT]: json(200, visitOf(LATE)),
      [`POST /api/v1/visits/${IDS.VISIT}/complete`]: json(200, visitOf({ ...LATE, ...COMPLETED })),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('visit-done'));
    expect(await screen.findByText('This field is required.')).toBeTruthy();
    expect(posts(`/visits/${IDS.VISIT}/complete`)).toHaveLength(0);
    fillTime('completed', 'Completed time', '04/Oct/2026', '15:30');
    fireEvent.click(screen.getByTestId('visit-done'));
    await screen.findByTestId('checkout');
    expect(bodyOf(posts(`/visits/${IDS.VISIT}/complete`)[0])).toStrictEqual({
      completed_at: '2026-10-04T15:30:00+06:30',
    });
  });

  it('a visit that is not a late entry shows no time field and sends nothing extra', async () => {
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, saleOf()),
      [VISIT]: json(200, visitOf()),
      [`POST /api/v1/visits/${IDS.VISIT}/complete`]: json(200, visitOf({ ...COMPLETED })),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('visit-done'));
    await screen.findByTestId('checkout');
    expect(screen.queryByTestId('late-entry-completed')).toBeNull();
    expect(bodyOf(posts(`/visits/${IDS.VISIT}/complete`)[0])).toStrictEqual({});
    expect(screen.queryByText('Late entry')).toBeNull();
  });
});

// Each test fills up to four late-entry dates and times (a 288-time combobox each): 4.7–5.1 s in a
// full `pnpm test` on 8 cores against the 5 s default, so these get 10 s (measured on #18, 02/Nov/2026).
describe('payments and FINISH on a late entry (task 4.5)', { timeout: 10_000 }, () => {
  it('Cash sends the kept received time', async () => {
    keepLateEntryTimes(IDS.VISIT, KEPT);
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, saleOf()),
      [VISIT]: json(200, visitOf({ ...LATE, ...COMPLETED })),
      [`POST /api/v1/sales/${IDS.SALE}/payments`]: json(201, PAID),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('pay-CASH'));
    await screen.findByTestId('finish-submit');
    expect(bodyOf(posts(`/sales/${IDS.SALE}/payments`)[0])).toStrictEqual({
      payment_method_id: IDS.CASH,
      amount: 10_000,
      received_at: KEPT.received_at,
    });
  });

  it('Finish sends the kept finish time and forgets the times after it', async () => {
    keepLateEntryTimes(IDS.VISIT, KEPT);
    const finished = saleOf({
      ...PAID,
      status: SaleStatus.FINISHED,
      receipt_number: 'B3-2026-OCT-00001',
      business_date: '2026-10-04',
      finished_at: KEPT.finished_at,
      finished_by: { user_id: IDS.AUNG_USER, display_name: 'Ko Aung' },
      actions: {
        ...saleOf().actions,
        edit_lines: false,
        take_payment: false,
        mark_incomplete: false,
      },
    });
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, PAID),
      [VISIT]: json(200, visitOf({ ...LATE, ...COMPLETED, sale: PAID })),
      [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(200, finished),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finish-submit'));
    await screen.findByTestId('success-panel');
    expect(bodyOf(posts(`/sales/${IDS.SALE}/finish`)[0])).toMatchObject({
      finished_at: KEPT.finished_at,
    });
    await waitFor(() => expect(keptLateEntryTimes(IDS.VISIT)).toBeNull());
  });

  it('without the kept finish time, Finish asks for it and sends nothing', async () => {
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, PAID),
      [VISIT]: json(200, visitOf({ ...LATE, ...COMPLETED, sale: PAID })),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finish-submit'));
    expect(await screen.findByText('This field is required.')).toBeTruthy();
    expect(screen.getByTestId('late-entry-finished')).toBeTruthy();
    expect(posts(`/sales/${IDS.SALE}/finish`)).toHaveLength(0);
  });
});

// Each test fills up to four late-entry dates and times (a 288-time combobox each): 4.7–5.1 s in a
// full `pnpm test` on 8 cores against the 5 s default, so these get 10 s (measured on #18, 02/Nov/2026).
describe('review of #29 — the payment sheet and a refused kept time', { timeout: 10_000 }, () => {
  it('KBZPay without the kept received time: the field is in the sheet, required, then sent', async () => {
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, saleOf()),
      [VISIT]: json(200, visitOf({ ...LATE, ...COMPLETED })),
      [`POST /api/v1/sales/${IDS.SALE}/payments`]: json(201, PAID),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('pay-KBZPAY'));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByTestId('late-entry-received')).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText(/^Reference/), {
      target: { value: 'KBZ0001234567' },
    });
    fireEvent.click(within(sheet).getByTestId('payment-submit'));
    expect(await within(sheet).findByText('This field is required.')).toBeTruthy();
    expect(posts(`/sales/${IDS.SALE}/payments`)).toHaveLength(0);
    fillTime('received', 'Payment received time', '04/Oct/2026', '15:35');
    fireEvent.click(within(sheet).getByTestId('payment-submit'));
    await waitFor(() => expect(posts(`/sales/${IDS.SALE}/payments`)).toHaveLength(1));
    expect(bodyOf(posts(`/sales/${IDS.SALE}/payments`)[0])).toMatchObject({
      payment_method_id: IDS.KBZPAY,
      external_reference: 'KBZ0001234567',
      received_at: '2026-10-04T15:35:00+06:30',
    });
  });

  it('Finish refused with late_entry_time: the kept finish time is set aside and the field shows with the order message', async () => {
    keepLateEntryTimes(IDS.VISIT, KEPT);
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, PAID),
      [VISIT]: json(200, visitOf({ ...LATE, ...COMPLETED, sale: PAID })),
      [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(422, problem(422, 'late_entry_time')),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finish-submit'));
    const field = await screen.findByTestId('late-entry-finished');
    expect(within(field).getByRole('alert').textContent).toMatch(/must be in order/);
  });
});
