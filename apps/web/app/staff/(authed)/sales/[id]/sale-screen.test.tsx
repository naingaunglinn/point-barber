// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PaymentDto, PaymentMethodKind, SaleStatus, VisitStatus } from '@point/shared';

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
/** The GET reads of the sale so far. */
const saleReads = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) => init?.method === 'GET' && String(url) === `/api/v1/sales/${IDS.SALE}`,
  ).length;

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
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
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
      status: VisitStatus.INCOMPLETE,
      incomplete_at: '2026-10-05T10:06:00+06:30',
      incomplete_by: { user_id: IDS.AUNG_USER, display_name: 'Ko Aung' },
      incomplete_reason: 'Started by mistake',
      sale: saleOf({ status: SaleStatus.CANCELLED, cancelled_at: '2026-10-05T10:06:00+06:30' }),
    });
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, cancelled.sale),
      [VISIT]: json(200, cancelled),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    const view = await screen.findByTestId('sale-cancelled');
    expect(view.textContent).toContain('Started by mistake');
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
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
    const serviceDone = await screen.findByTestId('visit-done');
    expect(document.title).toBe('In progress');
    fireEvent.click(serviceDone);
    expect(await screen.findByTestId('checkout')).toBeTruthy();
    expect(screen.getByTestId('checkout-total').textContent).toContain('10,000');
    // The page title follows the step, rewritten in place (task 13.8).
    expect(document.title).toBe('Checkout');
    expect(document.head.querySelectorAll('title')).toHaveLength(1);
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
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /^Remove/ }).map((b) => b.getAttribute('aria-label')),
      ).toStrictEqual(['Remove Haircut', 'Remove Shave']),
    );
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

describe('checkout — a refused payment (task 12.8 · design D11)', () => {
  it('a Cash payment refused (amount_exceeds_remaining) → the alert, and the sale is loaded again', async () => {
    routeFetch(fetchMock, {
      ...BASE,
      [SALE]: json(200, saleOf()),
      [VISIT]: json(200, visitOf({ ...COMPLETED })),
      [`POST /api/v1/sales/${IDS.SALE}/payments`]: json(
        422,
        problem(422, 'amount_exceeds_remaining'),
      ),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    const cash = await screen.findByTestId('pay-CASH');
    await waitFor(() => expect(saleReads()).toBeGreaterThan(0));
    const before = saleReads();
    fireEvent.click(cash);
    expect(
      await screen.findByText('This amount is more than the amount left to pay.'),
    ).toBeTruthy();
    await waitFor(() => expect(saleReads()).toBeGreaterThan(before));
  });
});

const paidRoutes = (extra: Record<string, Route> = {}) => ({
  ...BASE,
  [SALE]: json(200, PAID),
  [VISIT]: json(200, visitOf({ ...COMPLETED, sale: PAID })),
  ...extra,
});
const FINISHED = saleOf({
  ...PAID,
  status: SaleStatus.FINISHED,
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

describe('FINISH and after (group 13)', () => {
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

  // Tasks 15.6 / 15.7 — payments spec "The change of an over-transfer is at most 10,000 Ks" (owner WR1):
  // Ko Min's Haircut 8,000 paid by one KBZPay payment.
  const overTransfer = (amount: number, change: number) => {
    const kbzpay = {
      id: IDS.KBZPAY,
      code: 'KBZPAY',
      name_mm: 'KBZPay',
      name_en: 'KBZPay',
      kind: PaymentMethodKind.MOBILE_WALLET,
    };
    const over = saleOf({
      ...PAID,
      items: [
        lineOf({ unit_price_amount: 8_000, list_price_amount: 8_000, line_total_amount: 8_000 }),
      ],
      subtotal_amount: 8_000,
      total_amount: 8_000,
      paid_amount: amount,
      change_due_amount: change,
      payments: [
        paymentOf({
          amount,
          external_reference: 'KBZ0001234592',
          payment_method: kbzpay,
          effective_payment_method: kbzpay,
        }),
      ],
    });
    return {
      ...paidRoutes(),
      [SALE]: json(200, over),
      [VISIT]: json(200, visitOf({ ...COMPLETED, sale: over })),
    };
  };

  it.each([
    ['en', 'Check the transfer amount.'],
    ['my', 'ငွေလွှဲ ပမာဏ စစ်ပါ'],
  ] as const)(
    'Scenario: The checkout shows the refusal before Finish — KBZPay 20,000 on 8,000 (%s): no "Change to return", Finish disabled with the message',
    async (locale, message) => {
      routeFetch(fetchMock, overTransfer(20_000, 12_000)); // 20,000 − 8,000
      renderPos(<SaleScreen id={IDS.SALE} />, { locale });
      const finish = (await screen.findByTestId('finish-submit')) as HTMLButtonElement;
      expect(screen.queryByTestId('money-change')).toBeNull();
      expect(finish.disabled).toBe(true);
      const reason = document.getElementById(finish.getAttribute('aria-describedby') ?? '');
      expect(reason?.textContent).toBe(message);
      fireEvent.click(finish);
      expect(posts(`/sales/${IDS.SALE}/finish`)).toHaveLength(0);
    },
  );

  it('Scenario: A change of exactly 10,000 Ks — KBZPay 18,000: "Change to return: 10,000 Ks", Finish enabled', async () => {
    routeFetch(fetchMock, overTransfer(18_000, 10_000)); // 18,000 − 8,000
    renderPos(<SaleScreen id={IDS.SALE} />);
    expect((await screen.findByTestId('money-change')).textContent).toBe(
      'Change to return: 10,000 Ks',
    );
    const finish = screen.getByTestId('finish-submit') as HTMLButtonElement;
    expect(finish.disabled).toBe(false);
    expect(finish.getAttribute('aria-describedby')).toBeNull();
  });

  it('a FINISH refusal change_too_large shows the message of error.change_too_large once (task 15.7)', async () => {
    routeFetch(
      fetchMock,
      paidRoutes({
        [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(
          422,
          problem(422, 'change_too_large', {
            context: { change_due_amount: 12_000, max_change_amount: 10_000 },
          }),
        ),
      }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finish-submit'));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    expect(screen.getByRole('alert').textContent).toBe('Check the transfer amount.');
  });

  // Design D11: a FINISH refused on stale data reloads the sale — the total changed, a payment was voided
  // elsewhere (amount_mismatch), or the change of an over-transfer is now above 10,000 Ks.
  it.each([
    [409, 'total_changed'],
    [422, 'amount_mismatch'],
    [422, 'change_too_large'],
  ] as const)('%s %s → the sale is loaded again', async (status, code) => {
    routeFetch(
      fetchMock,
      paidRoutes({
        [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(status, problem(status, code)),
      }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    const finish = await screen.findByTestId('finish-submit');
    const before = saleReads();
    fireEvent.click(finish);
    await waitFor(() => expect(posts(`/sales/${IDS.SALE}/finish`)).toHaveLength(1));
    await waitFor(() => expect(saleReads()).toBeGreaterThan(before));
  });

  it('change_too_large, and the reloaded sale shows the over-transfer — the message once, under the button', async () => {
    const reloaded = overTransfer(20_000, 12_000);
    const left = reloaded[SALE] as Response;
    let reads = 0;
    routeFetch(fetchMock, {
      ...reloaded,
      // The first read is the paid sale the screen showed; the reload answers what another device left.
      [SALE]: () => ((reads += 1), reads === 1 ? json(200, PAID) : left.clone()),
      [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(
        422,
        problem(422, 'change_too_large', {
          context: { change_due_amount: 12_000, max_change_amount: 10_000 },
        }),
      ),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finish-submit'));
    // The reloaded sale disables the button with its reason; the refusal is not repeated above it.
    await waitFor(() =>
      expect(screen.getByTestId('finish-submit').getAttribute('aria-describedby')).not.toBeNull(),
    );
    const finish = screen.getByTestId('finish-submit');
    const reason = document.getElementById(finish.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('Check the transfer amount.');
    expect(screen.getAllByText('Check the transfer amount.')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // Dev 2's review of 7b5b654 — a FINISH refusal speaks of the payments it was refused on: once they are
  // put right on the screen (the transfer voided, KBZPay 18,000 taken), it is not shown above an enabled
  // Finish. Ko Min's Haircut 8,000.
  const kbzpayRef = {
    id: IDS.KBZPAY,
    code: 'KBZPAY',
    name_mm: 'KBZPay',
    name_en: 'KBZPay',
    kind: PaymentMethodKind.MOBILE_WALLET,
  };
  const transfer = (id: string, amount: number, reference: string, voided = false) =>
    paymentOf({
      id,
      amount,
      external_reference: reference,
      payment_method: kbzpayRef,
      effective_payment_method: kbzpayRef,
      ...(voided
        ? {
            voided_at: '2026-10-05T10:46:00+06:30',
            voided_by: { user_id: IDS.AUNG_USER, display_name: 'Ko Aung' },
            void_reason: 'Wrong amount',
          }
        : {}),
    });
  const haircut = (
    payments: PaymentDto[],
    amounts: { paid: number; remaining: number; change: number },
  ) =>
    saleOf({
      ...PAID,
      items: [
        lineOf({ unit_price_amount: 8_000, list_price_amount: 8_000, line_total_amount: 8_000 }),
      ],
      subtotal_amount: 8_000,
      total_amount: 8_000,
      paid_amount: amounts.paid,
      remaining_amount: amounts.remaining,
      change_due_amount: amounts.change,
      payments,
    });
  const FIRST = '0199a3f2-0000-7000-800a-000000000011';
  const WRONG = '0199a3f2-0000-7000-800a-000000000012';
  const RIGHT = '0199a3f2-0000-7000-800a-000000000013';

  /** Voids the live transfer through its reason dialog, then takes KBZPay 18,000 through the sheet. */
  async function voidThenPay18000(paymentId: string, amount: string) {
    fireEvent.click(screen.getByRole('button', { name: `Void payment KBZPay ${amount} Ks` }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Wrong amount' } });
    fireEvent.click(
      within(dialog).getAllByRole('button', { name: 'Void payment' }).at(-1) as HTMLElement,
    );
    await waitFor(() => expect(posts(`/payments/${paymentId}/void`)).toHaveLength(1));
    fireEvent.click(await screen.findByTestId('pay-KBZPAY'));
    fireEvent.change(await screen.findByLabelText(/^Amount/), { target: { value: '18000' } });
    fireEvent.change(screen.getByLabelText(/^Reference/), { target: { value: 'KBZ0001234593' } });
    fireEvent.click(screen.getByTestId('payment-submit'));
    await waitFor(() => expect(posts(`/sales/${IDS.SALE}/payments`)).toHaveLength(1));
    expect(bodyOf(posts(`/sales/${IDS.SALE}/payments`)[0])).toStrictEqual({
      payment_method_id: IDS.KBZPAY,
      amount: 18_000,
      external_reference: 'KBZ0001234593',
    });
  }

  /** Finish enabled with "Change to return: 10,000 Ks" and no alert anywhere on the checkout. */
  async function expectRightAgain() {
    expect((await screen.findByTestId('money-change')).textContent).toBe(
      'Change to return: 10,000 Ks',
    );
    const finish = screen.getByTestId('finish-submit') as HTMLButtonElement;
    expect(finish.disabled).toBe(false);
    expect(finish.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByText('Check the transfer amount.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  }

  it('change_too_large → the reload shows KBZPay 20,000 → void it, KBZPay 18,000: no "Check the transfer amount." above an enabled Finish', async () => {
    // The screen showed KBZPay 10,000; another device voided it and took 20,000 (change 12,000).
    const shown = haircut([transfer(FIRST, 10_000, 'KBZ0001234591')], {
      paid: 10_000,
      remaining: 0,
      change: 2_000,
    });
    const left = haircut(
      [transfer(FIRST, 10_000, 'KBZ0001234591', true), transfer(WRONG, 20_000, 'KBZ0001234592')],
      { paid: 20_000, remaining: 0, change: 12_000 },
    );
    const voided = haircut(
      [
        transfer(FIRST, 10_000, 'KBZ0001234591', true),
        transfer(WRONG, 20_000, 'KBZ0001234592', true),
      ],
      { paid: 0, remaining: 8_000, change: 0 },
    );
    const right = haircut(
      [
        transfer(FIRST, 10_000, 'KBZ0001234591', true),
        transfer(WRONG, 20_000, 'KBZ0001234592', true),
        transfer(RIGHT, 18_000, 'KBZ0001234593'),
      ],
      { paid: 18_000, remaining: 0, change: 10_000 },
    );
    let server = shown;
    routeFetch(fetchMock, {
      ...paidRoutes(),
      [SALE]: () => json(200, server),
      [VISIT]: json(200, visitOf({ ...COMPLETED, sale: shown })),
      [`POST /api/v1/sales/${IDS.SALE}/finish`]: () => {
        server = left;
        return json(
          422,
          problem(422, 'change_too_large', {
            context: { change_due_amount: 12_000, max_change_amount: 10_000 },
          }),
        );
      },
      [`POST /api/v1/payments/${WRONG}/void`]: () => ((server = voided), json(200, voided)),
      [`POST /api/v1/sales/${IDS.SALE}/payments`]: () => ((server = right), json(201, right)),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finish-submit'));
    // The reload: the button says it, the refusal is not repeated above it.
    await waitFor(() =>
      expect(screen.getByTestId('finish-submit').getAttribute('aria-describedby')).not.toBeNull(),
    );
    expect(screen.getAllByText('Check the transfer amount.')).toHaveLength(1);
    await voidThenPay18000(WRONG, '20,000');
    await expectRightAgain();
  });

  it('amount_mismatch shown above Finish → void the transfer, KBZPay 18,000: the old refusal is gone', async () => {
    const shown = haircut([transfer(FIRST, 10_000, 'KBZ0001234591')], {
      paid: 10_000,
      remaining: 0,
      change: 2_000,
    });
    const voided = haircut([transfer(FIRST, 10_000, 'KBZ0001234591', true)], {
      paid: 0,
      remaining: 8_000,
      change: 0,
    });
    const right = haircut(
      [transfer(FIRST, 10_000, 'KBZ0001234591', true), transfer(RIGHT, 18_000, 'KBZ0001234593')],
      { paid: 18_000, remaining: 0, change: 10_000 },
    );
    let server = shown;
    routeFetch(fetchMock, {
      ...paidRoutes(),
      [SALE]: () => json(200, server),
      [VISIT]: json(200, visitOf({ ...COMPLETED, sale: shown })),
      [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(422, problem(422, 'amount_mismatch')),
      [`POST /api/v1/payments/${FIRST}/void`]: () => ((server = voided), json(200, voided)),
      [`POST /api/v1/sales/${IDS.SALE}/payments`]: () => ((server = right), json(201, right)),
    });
    renderPos(<SaleScreen id={IDS.SALE} />);
    const finish = await screen.findByTestId('finish-submit');
    const before = saleReads();
    fireEvent.click(finish);
    await waitFor(() => expect(saleReads()).toBeGreaterThan(before));
    // The reload answered the same payments: the refusal stays in view.
    expect((await screen.findByRole('alert')).textContent).toBe(
      "The payments don't match the total.",
    );
    await voidThenPay18000(FIRST, '10,000');
    await expectRightAgain();
  });

  it('total_changed: the reload brings the new total and the refusal stays (the payments did not change)', async () => {
    const grown = saleOf({
      ...PAID,
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
      remaining_amount: 3_000,
    });
    let server = PAID;
    routeFetch(
      fetchMock,
      paidRoutes({
        [SALE]: () => json(200, server),
        [`POST /api/v1/sales/${IDS.SALE}/finish`]: () => {
          server = grown;
          return json(409, problem(409, 'total_changed', { context: { total_amount: 13_000 } }));
        },
      }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.click(await screen.findByTestId('finish-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('finish-submit').textContent).toBe('Finish · 13,000 Ks'),
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'The total has changed. Check it and finish again.',
    );
  });

  it('the phone lookup fails (500) — the Name is offered; FINISH naming customer.name makes it required', async () => {
    routeFetch(
      fetchMock,
      paidRoutes({
        'GET /api/v1/customers/lookup?phone=%2B95945001122': json(
          500,
          problem(500, 'internal_error'),
        ),
        [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(
          400,
          problem(400, 'validation', {
            errors: [{ field: 'customer.name', code: 'invalid_type' }],
          }),
        ),
      }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.change(await screen.findByLabelText('Customer phone (optional)'), {
      target: { value: '09 4500 1122' },
    });
    const name = await screen.findByLabelText(/^Name/);
    expect(name.getAttribute('aria-required')).toBeNull();
    fireEvent.click(screen.getByTestId('finish-submit'));
    await waitFor(() => expect(posts(`/sales/${IDS.SALE}/finish`)).toHaveLength(1));
    expect(bodyOf(posts(`/sales/${IDS.SALE}/finish`)[0])).toMatchObject({
      customer: { phone: '09 4500 1122' },
    });
    expect(await screen.findByText('This field is required.')).toBeTruthy();
    expect(screen.getByLabelText(/^Name/).getAttribute('aria-required')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('while the phone lookup runs, Finish is disabled and sends nothing', async () => {
    routeFetch(
      fetchMock,
      paidRoutes({
        'GET /api/v1/customers/lookup?phone=%2B95945001122': () => new Promise<never>(() => {}),
      }),
    );
    renderPos(<SaleScreen id={IDS.SALE} />);
    fireEvent.change(await screen.findByLabelText('Customer phone (optional)'), {
      target: { value: '09 4500 1122' },
    });
    const finish = screen.getByTestId('finish-submit') as HTMLButtonElement;
    await waitFor(() => expect(finish.disabled).toBe(true));
    fireEvent.click(finish);
    expect(posts(`/sales/${IDS.SALE}/finish`)).toHaveLength(0);
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

  const finishedRoutes = (pdf: Route) => ({
    ...BASE,
    [SALE]: json(200, FINISHED),
    [VISIT]: json(200, visitOf({ ...COMPLETED, status: VisitStatus.FINISHED, sale: FINISHED })),
    [`GET /api/v1/sales/${IDS.SALE}/receipt?format=json`]: json(200, receiptOf()),
    [`GET /api/v1/sales/${IDS.SALE}/receipt?format=pdf`]: pdf,
  });
  const pdfFile = () =>
    new Response(new Blob(['%PDF']), { headers: { 'Content-Type': 'application/pdf' } });
  const pdfReads = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/receipt?format=pdf')).length;

  it('a finished sale opened by its link → the receipt from format=json; the PDF loaded first, opened in the tap itself', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    URL.createObjectURL = vi.fn(() => 'blob:receipt');
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    routeFetch(fetchMock, finishedRoutes(pdfFile()));
    const view = renderPos(<SaleScreen id={IDS.SALE} />);
    const share = (await screen.findByTestId('finished-share')) as HTMLButtonElement;
    // Busy while the PDF loads; it is loaded before any tap.
    await waitFor(() => expect(share.disabled).toBe(false));
    expect(pdfReads()).toBe(1);
    fireEvent.click(share);
    // In the tap itself — nothing awaited — so no browser blocks the new tab (task 13.6).
    expect(open).toHaveBeenCalledWith('blob:receipt', '_blank', 'noopener');
    expect(pdfReads()).toBe(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/receipt?format=json'))).toBe(
      true,
    );
    // The blob URL stays while the tab may read it; it is revoked when the screen leaves.
    expect(revoke).not.toHaveBeenCalled();
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:receipt');
  });

  it('Scenario: PDF on an iPhone — right after FINISH the share sheet opens in the tap, with the file', async () => {
    const share = vi.fn(async () => {});
    // jsdom's navigator has no Web Share: the two members are added for this test only.
    const device = { canShare: () => true, share };
    for (const [name, value] of Object.entries(device)) {
      Object.defineProperty(navigator, name, { value, configurable: true });
    }
    try {
      routeFetch(fetchMock, {
        ...paidRoutes({ [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(200, FINISHED) }),
        [`GET /api/v1/sales/${IDS.SALE}/receipt?format=pdf`]: pdfFile(),
      });
      renderPos(<SaleScreen id={IDS.SALE} />);
      fireEvent.click(await screen.findByTestId('finish-submit'));
      const button = (await screen.findByTestId('success-share')) as HTMLButtonElement;
      await waitFor(() => expect(button.disabled).toBe(false));
      fireEvent.click(button);
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'B3-2026-OCT-00001.pdf', files: [expect.any(File)] }),
      );
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      for (const name of Object.keys(device)) Reflect.deleteProperty(navigator, name);
    }
  });

  it('the PDF did not load — a tap loads it again (no alert before the tap), a second failure shows the alert', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    routeFetch(fetchMock, finishedRoutes(json(500, problem(500, 'internal_error'))));
    renderPos(<SaleScreen id={IDS.SALE} />);
    const share = (await screen.findByTestId('finished-share')) as HTMLButtonElement;
    await waitFor(() => expect(pdfReads()).toBe(1));
    await waitFor(() => expect(share.disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(share);
    await waitFor(() => expect(pdfReads()).toBe(2));
    expect(
      await screen.findByText(
        'Something went wrong on the server. Try again; if it happens again, give the error ID to an admin.',
      ),
    ).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('the page title and the level-1 heading by step (task 13.8 · WCAG 2.4.2 · AD-A11Y-01)', () => {
  const CANCELLED_VISIT = visitOf({
    status: VisitStatus.INCOMPLETE,
    incomplete_at: '2026-10-05T10:06:00+06:30',
    incomplete_by: { user_id: IDS.AUNG_USER, display_name: 'Ko Aung' },
    incomplete_reason: 'Started by mistake',
    sale: saleOf({ status: SaleStatus.CANCELLED, cancelled_at: '2026-10-05T10:06:00+06:30' }),
  });
  const STEPS = [
    {
      step: 'in progress',
      routes: { ...BASE, [SALE]: json(200, saleOf()), [VISIT]: json(200, visitOf()) },
      en: 'In progress',
      my: 'လုပ်ဆောင်နေဆဲ',
    },
    {
      step: 'checkout',
      routes: { ...BASE, [SALE]: json(200, saleOf()), [VISIT]: json(200, visitOf(COMPLETED)) },
      en: 'Checkout',
      my: 'ငွေရှင်း',
    },
    {
      step: 'the success panel right after FINISH',
      routes: paidRoutes({ [`POST /api/v1/sales/${IDS.SALE}/finish`]: json(200, FINISHED) }),
      finish: true,
      en: 'Sale finished',
      my: 'ငွေရှင်းပြီးပါပြီ',
    },
    {
      step: 'a finished sale opened again',
      routes: {
        ...BASE,
        [SALE]: json(200, FINISHED),
        [VISIT]: json(200, visitOf({ ...COMPLETED, status: VisitStatus.FINISHED, sale: FINISHED })),
        [`GET /api/v1/sales/${IDS.SALE}/receipt?format=json`]: json(200, receiptOf()),
      },
      en: 'Sale finished',
      my: 'ငွေရှင်းပြီးပါပြီ',
    },
    {
      step: 'a cancelled sale',
      routes: {
        ...BASE,
        [SALE]: json(200, CANCELLED_VISIT.sale),
        [VISIT]: json(200, CANCELLED_VISIT),
      },
      en: 'Cancelled',
      my: 'ပယ်ဖျက်ပြီး',
    },
  ] as const;
  const ROWS = STEPS.flatMap((row) =>
    (['en', 'my'] as const).map((locale) => ({ ...row, locale, title: row[locale] })),
  );

  const showStep = async ({ routes, locale, ...row }: (typeof ROWS)[number]) => {
    routeFetch(fetchMock, routes);
    renderPos(<SaleScreen id={IDS.SALE} />, { locale });
    if ('finish' in row) {
      fireEvent.click(await screen.findByTestId('finish-submit'));
      expect(await screen.findByTestId('success-panel')).toBeTruthy();
    }
  };

  it.each(ROWS)('$step · $locale → "$title"', async (row) => {
    await showStep(row);
    await waitFor(() => expect(document.title).toBe(row.title));
    expect(document.head.querySelectorAll('title')).toHaveLength(1);
  });

  it.each(ROWS)('$step · $locale → one level-1 heading, "$title"', async (row) => {
    await showStep(row);
    expect(await screen.findByRole('heading', { level: 1, name: row.title })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
