// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IDS,
  categoryOf,
  lineOf,
  methodOf,
  paymentOf,
  receiptOf,
  saleOf,
  serviceOf,
  visitOf,
} from '../../../../../test/pos-fixtures';
import { type Route, renderPos, routeFetch } from '../../../../../test/pos-render';
import { json, problem } from '../../../../../test/render';

// add-walkin-visit-checkout groups 11 – 13 on the screen of a sale: the state router (in progress,
// checkout, finished, cancelled, forbidden), COMPLETE, a line, Cash in one tap with one key, KBZPay through
// the sheet, "Already saved" on a replay, FINISH (Skip, total_changed, the override reason), the success
// panel and the read-only receipt — against the routes the API answers (visits, sales-checkout and
// payments specs).
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => `/sales/x`,
  useSearchParams: () => new URLSearchParams(),
}));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('@point/ui', async (load) => {
  const ui = await load<typeof import('@point/ui')>();
  return { ...ui, toast: { ...ui.toast, success: toastSuccess } };
});
const { SaleScreen } = await import('./sale-screen');

const SALE = `GET /api/v1/sales/${IDS.SALE}`;
const VISIT = `GET /api/v1/visits/${IDS.VISIT}`;
const BASE: Record<string, Route> = {
  [`GET /api/v1/services?branch_id=${IDS.B3}&pricing_mode=1&limit=100`]: json(200, {
    items: [serviceOf(IDS.HAIRCUT, 'Haircut', 1), serviceOf(IDS.SHAVE, 'Shave', 2)],
    next_cursor: null,
    total: null,
  }),
  'GET /api/v1/service-categories': json(200, { items: [categoryOf()] }),
  'GET /api/v1/payment-methods': json(200, { items: [methodOf('CASH'), methodOf('KBZPAY')] }),
};
const COMPLETED = { status: 2 as const, completed_at: '2026-10-05T10:40:00+06:30' };
const PAID = saleOf({
  paid_amount: 10_000,
  remaining_amount: 0,
  payments: [paymentOf()],
  actions: { ...saleOf().actions, finish: true },
});

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  toastSuccess.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const posts = (path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => init?.method === 'POST' && String(url) === `/api/v1${path}`,
  );
const bodyOf = (call: Parameters<typeof fetch> | undefined) =>
  JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;

describe('the state router (task 11.1)', () => {
  it('a STARTED visit → in progress: the lines, Add service, "Service done · Take payment"', async () => {
    routeFetch(fetchMock, { ...BASE, [SALE]: json(200, saleOf()), [VISIT]: json(200, visitOf()) });
    renderPos(<SaleScreen id={IDS.SALE} />);
    expect(await screen.findByTestId('visit-in-progress')).toBeTruthy();
    expect(screen.getByTestId('add-service')).toBeTruthy();
    expect(screen.getByTestId('visit-done')).toBeTruthy();
  });

  it('Scenario: Controls follow the actions of the sale — no edit_lines → no add, remove or done', async () => {
    const readOnly = saleOf({
      actions: { ...saleOf().actions, edit_lines: false, mark_incomplete: false },
    });
    routeFetch(fetchMock, { ...BASE, [SALE]: json(200, readOnly), [VISIT]: json(200, visitOf()) });
    renderPos(<SaleScreen id={IDS.SALE} />);
    await screen.findByTestId('visit-in-progress');
    expect(screen.queryByTestId('add-service')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByTestId('visit-done')).toBeNull();
  });

  it('a refused read (403) → the forbidden page state with a link Home', async () => {
    routeFetch(fetchMock, { [SALE]: json(403, problem(403, 'forbidden')) });
    renderPos(<SaleScreen id={IDS.SALE} />);
    expect(
      await screen.findByText("You don't have access to this page. Ask an admin if you need it."),
    ).toBeTruthy();
  });

  it('a failed visit read (404) → the page state, not an endless skeleton', async () => {
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, saleOf()),
      [VISIT]: json(404, problem(404, 'not_found')),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    expect(await screen.findByText("This item doesn't exist or was archived.")).toBeTruthy();
  });

  it('a read without an answer (500) → the error state with Retry', async () => {
    let calls = 0;
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: () => {
        calls += 1;
        return calls === 1 ? json(500, problem(500, 'internal_error')) : json(200, saleOf());
      },
      [VISIT]: json(200, visitOf()),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('visit-in-progress')).toBeTruthy();
  });

  it('a CANCELLED sale → read-only with who marked it incomplete and why', async () => {
    const cancelled = visitOf({
      status: 0,
      incomplete_at: '2026-10-05T10:06:00+06:30',
      incomplete_by: { user_id: IDS.AUNG_USER, display_name: 'Ko Aung' },
      incomplete_reason: 'Started by mistake',
      sale: saleOf({ status: 0, cancelled_at: '2026-10-05T10:06:00+06:30' }),
    });
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, cancelled.sale),
      [VISIT]: json(200, cancelled),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    const view = await screen.findByTestId('sale-cancelled');
    expect(view.textContent).toContain('Started by mistake');
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('in progress (tasks 11.3 – 11.6)', () => {
  it('Scenario: Service done — COMPLETE, then the checkout of 10,000', async () => {
    const done = visitOf({ ...COMPLETED });
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, saleOf()),
      [VISIT]: json(200, visitOf()),
      [`POST /api/v1/visits/${IDS.VISIT}/complete`]: json(200, done),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('visit-done'));
    expect(await screen.findByTestId('checkout')).toBeTruthy();
    expect(screen.getByTestId('checkout-total').textContent).toContain('10,000');
  });

  it('Scenario: No service yet — the service_required alert, still in progress', async () => {
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, saleOf({ items: [] })),
      [VISIT]: json(200, visitOf()),
      [`POST /api/v1/visits/${IDS.VISIT}/complete`]: json(422, problem(422, 'service_required')),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('visit-done'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByTestId('visit-in-progress')).toBeTruthy();
  });

  it('Add service: the quote of this performer and the visit date; the picked line is added', async () => {
    const two = saleOf({
      items: [
        lineOf(),
        lineOf({
          id: '0199a3f2-0000-7000-8008-000000000002',
          service_id: IDS.SHAVE,
          description_en: 'Shave',
          unit_price_amount: 3_000,
          list_price_amount: 3_000,
          line_total_amount: 3_000,
        }),
      ],
      subtotal_amount: 13_000,
      total_amount: 13_000,
      remaining_amount: 13_000,
    });
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, saleOf()),
      [VISIT]: json(200, visitOf()),
      'POST /api/v1/prices/quote': json(200, { items: [], subtotal_amount: 0, complete: true }),
      [`POST /api/v1/sales/${IDS.SALE}/items`]: json(200, two),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('add-service'));
    fireEvent.click(await screen.findByTestId(`pick-${IDS.SHAVE}`));
    await waitFor(() => expect(posts(`/sales/${IDS.SALE}/items`)).toHaveLength(1));
    expect(bodyOf(posts('/prices/quote')[0])).toMatchObject({
      branch_id: IDS.B3,
      location_type: 1,
      date: '2026-10-05',
      employee_id: IDS.AUNG,
    });
    expect(bodyOf(posts(`/sales/${IDS.SALE}/items`)[0])).toStrictEqual({
      line_type: 1,
      service_id: IDS.SHAVE,
    });
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2));
  });
});

describe('checkout (group 12)', () => {
  const checkoutRoutes = (extra: Record<string, Route> = {}) => ({
    ...BASE,
    [SALE]: json(200, saleOf()),
    [VISIT]: json(200, visitOf({ ...COMPLETED })),
    ...extra,
  });

  it('Scenario: One tap, full cash — one POST of 10,000 with a key, even on a double tap', async () => {
    routeFetch(
      fetchMock,
      checkoutRoutes({ [`POST /api/v1/sales/${IDS.SALE}/payments`]: json(201, PAID) }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    const cash = await screen.findByTestId('pay-CASH');
    fireEvent.click(cash);
    fireEvent.click(cash);
    await screen.findByTestId('finish-submit');
    const calls = posts(`/sales/${IDS.SALE}/payments`);
    expect(calls).toHaveLength(1);
    expect(bodyOf(calls[0])).toStrictEqual({ payment_method_id: IDS.CASH, amount: 10_000 });
    expect((calls[0]?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it('a replayed payment reads "Already saved"', async () => {
    routeFetch(
      fetchMock,
      checkoutRoutes({
        [`POST /api/v1/sales/${IDS.SALE}/payments`]: json(200, PAID, {
          'Idempotent-Replayed': 'true',
        }),
      }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('pay-CASH'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Already saved'));
  });

  it('KBZPay: the reference sheet; a reference already used shows under the field', async () => {
    routeFetch(
      fetchMock,
      checkoutRoutes({
        [`POST /api/v1/sales/${IDS.SALE}/payments`]: json(
          409,
          problem(409, 'duplicate_reference', { context: { receipt_number: null } }),
        ),
      }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('pay-KBZPAY'));
    fireEvent.change(await screen.findByLabelText(/^Reference/), {
      target: { value: 'KBZ0001234567' },
    });
    fireEvent.click(screen.getByTestId('payment-submit'));
    await waitFor(() => expect(posts(`/sales/${IDS.SALE}/payments`)).toHaveLength(1));
    expect(bodyOf(posts(`/sales/${IDS.SALE}/payments`)[0])).toStrictEqual({
      payment_method_id: IDS.KBZPAY,
      amount: 10_000,
      external_reference: 'KBZ0001234567',
    });
    expect(
      await screen.findByText('This reference is already recorded. Check the transfer.'),
    ).toBeTruthy();
  });

  it('a reference refusal stays with the sheet: closing it leaves no alert on the checkout', async () => {
    routeFetch(
      fetchMock,
      checkoutRoutes({
        [`POST /api/v1/sales/${IDS.SALE}/payments`]: json(
          409,
          problem(409, 'duplicate_reference', { context: { receipt_number: 'B3-2026-OCT-00001' } }),
        ),
      }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('pay-KBZPAY'));
    fireEvent.change(await screen.findByLabelText(/^Reference/), {
      target: { value: 'KBZ0001234567' },
    });
    fireEvent.click(screen.getByTestId('payment-submit'));
    expect(
      await screen.findByText('This reference was already used on B3-2026-OCT-00001.'),
    ).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('FINISH and after (group 13)', () => {
  const paidRoutes = (extra: Record<string, Route> = {}) => ({
    ...BASE,
    [SALE]: json(200, PAID),
    [VISIT]: json(200, visitOf({ ...COMPLETED, sale: PAID })),
    ...extra,
  });
  const FINISHED = saleOf({
    ...PAID,
    status: 2,
    receipt_number: 'B3-2026-OCT-00001',
    business_date: '2026-10-05',
    finished_at: '2026-10-05T10:42:00+06:30',
    finished_by: { user_id: IDS.AUNG_USER, display_name: 'Ko Aung' },
    actions: {
      ...saleOf().actions,
      edit_lines: false,
      take_payment: false,
      mark_incomplete: false,
    },
  });

  it('Skip → FINISH with no customer and the total on the button → the success panel; Next customer → Today', async () => {
    routeFetch(
      fetchMock,
      paidRoutes({ [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(200, FINISHED) }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finish-submit'));
    expect(await screen.findByTestId('success-panel')).toBeTruthy();
    expect(screen.getByTestId('success-number').textContent).toBe('B3-2026-OCT-00001');
    expect(bodyOf(posts(`/sales/${IDS.SALE}/finish`)[0])).toStrictEqual({
      expected_total_amount: 10_000,
      customer: null,
    });
    fireEvent.click(screen.getByTestId('success-next'));
    expect(push).toHaveBeenCalledWith('/today');
  });

  it('Scenario: Finish stays disabled while money is missing — "Remaining to pay" and the reason under the button', async () => {
    const short = saleOf({
      ...PAID,
      items: [
        lineOf({ unit_price_amount: 8_000, list_price_amount: 8_000, line_total_amount: 8_000 }),
        lineOf({
          id: '0199a3f2-0000-7000-8008-000000000002',
          service_id: IDS.SHAVE,
          description_en: 'Shave',
          unit_price_amount: 3_000,
          list_price_amount: 3_000,
          line_total_amount: 3_000,
        }),
      ],
      subtotal_amount: 11_000,
      total_amount: 11_000,
      paid_amount: 8_000,
      remaining_amount: 3_000,
      payments: [paymentOf({ amount: 8_000 })],
      actions: { ...PAID.actions, take_payment: true },
    });
    routeFetch(fetchMock, {
      ...paidRoutes(),
      [SALE]: json(200, short),
      [VISIT]: json(200, visitOf({ ...COMPLETED, sale: short })),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    expect((await screen.findByTestId('money-remaining')).textContent).toBe(
      'Remaining to pay: 3,000 Ks',
    );
    const finish = screen.getByTestId('finish-submit') as HTMLButtonElement;
    expect(finish.textContent).toBe('Finish · 11,000 Ks');
    expect(finish.disabled).toBe(true);
    expect(screen.getByText('Take the remaining 3,000 Ks before you finish.')).toBeTruthy();
    expect(await screen.findByTestId('pay-CASH')).toBeTruthy();
  });

  it('a FINISH refusal shows once (amount_mismatch)', async () => {
    routeFetch(
      fetchMock,
      paidRoutes({
        [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(422, problem(422, 'amount_mismatch')),
      }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finish-submit'));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
  });

  it('Scenario: KBZPay 10,000 for a haircut of 8,000 — "Change to return: 2,000 Ks" next to Finish', async () => {
    const kbz = paymentOf({
      amount: 10_000,
      external_reference: 'KBZ0001234591',
      payment_method: {
        id: IDS.KBZPAY,
        code: 'KBZPAY',
        name_mm: 'KBZPay',
        name_en: 'KBZPay',
        kind: 2,
      },
      effective_payment_method: {
        id: IDS.KBZPAY,
        code: 'KBZPAY',
        name_mm: 'KBZPay',
        name_en: 'KBZPay',
        kind: 2,
      },
    });
    const over = saleOf({
      ...PAID,
      items: [
        lineOf({ unit_price_amount: 8_000, list_price_amount: 8_000, line_total_amount: 8_000 }),
      ],
      subtotal_amount: 8_000,
      total_amount: 8_000,
      paid_amount: 10_000,
      change_due_amount: 2_000,
      payments: [kbz],
    });
    routeFetch(fetchMock, {
      ...paidRoutes(),
      [SALE]: json(200, over),
      [VISIT]: json(200, visitOf({ ...COMPLETED, sale: over })),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    expect((await screen.findByTestId('money-change')).textContent).toContain('2,000');
    expect(screen.getByTestId('finish-submit')).toBeTruthy();
  });

  it('total_changed → the sale is loaded again', async () => {
    routeFetch(
      fetchMock,
      paidRoutes({
        [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(409, problem(409, 'total_changed')),
      }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finish-submit'));
    const reads = () =>
      fetchMock.mock.calls.filter(
        ([url, init]) => init?.method === 'GET' && String(url) === `/api/v1/sales/${IDS.SALE}`,
      ).length;
    const before = reads();
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  it('Scenario: Finish for an absent barber with a reason — override_reason is sent', async () => {
    const holder = saleOf({ ...PAID, actions: { ...PAID.actions, finish_needs_reason: true } });
    routeFetch(fetchMock, {
      ...paidRoutes({ [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(200, FINISHED) }),
      [SALE]: json(200, holder),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finish-submit'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Ko Aung went home' },
    });
    fireEvent.click(
      within(dialog).getAllByRole('button', { name: 'Finish' }).at(-1) as HTMLElement,
    );
    await waitFor(() => expect(posts(`/sales/${IDS.SALE}/finish`)).toHaveLength(1));
    expect(bodyOf(posts(`/sales/${IDS.SALE}/finish`)[0])).toMatchObject({
      override_reason: 'Ko Aung went home',
    });
  });

  it('a finished sale opened by its link → the receipt from format=json; View / share PDF fetches the file', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    URL.createObjectURL = vi.fn(() => 'blob:receipt');
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, FINISHED),
      [VISIT]: json(200, visitOf({ ...COMPLETED, status: 3, sale: FINISHED })),
      [`GET /api/v1/sales/${IDS.SALE}/receipt?format=json`]: json(200, receiptOf()),
      [`GET /api/v1/sales/${IDS.SALE}/receipt?format=pdf`]: new Response(new Blob(['%PDF']), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finished-share'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('blob:receipt', '_blank', 'noopener'));
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/receipt?format=json'))).toBe(
      true,
    );
  });
});
