// @vitest-environment jsdom
import { type CollectorDto, moneyFromWire } from '@point/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IDS, methodOf, paymentOf } from '../../test/pos-fixtures';
import { routeFetch } from '../../test/pos-render';
import { json, problem, renderStaff } from '../../test/render';
import { CollectorPicker } from './CollectorPicker';
import { PaymentList } from './PaymentList';
import { PaymentSheet } from './PaymentSheet';

// add-payment-collector-picker tasks 4.1, 4.2 — the payment sheet and the payment lines (AD-POS-08 ·
// AD-CMP-09 · AD-FORM-14 · AD-A11Y-03 · AD-PERF-04 · D-VIS-06): "Collected by" with the default's chip and
// "Change", the list in the server's order with its marks as text, the collector sent only when it is not
// the default, and the line's change that keeps its chip until the answer.
const COLLECTORS = `GET /api/v1/sales/${IDS.SALE}/collectors`;
const person = (n: number, name: string, extra: Partial<CollectorDto> = {}): CollectorDto => ({
  employee_id: `00000000-0000-4000-8000-00000000000${n}`,
  display_name: name,
  clocked_in: false,
  is_default: false,
  ...extra,
});
const AUNG = person(1, 'Ko Aung', { clocked_in: true, is_default: true });
const MIN = person(2, 'Ko Min', { clocked_in: true });
const FIVE = [AUNG, MIN, person(3, 'Ma Hnin'), person(4, 'Ma Thida'), person(5, 'U Kyaw Zin')];
const fetchMock = vi.fn<typeof fetch>();
const answer = (items: readonly CollectorDto[]) =>
  routeFetch(fetchMock, { [COLLECTORS]: json(200, { items }) });
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('CollectorPicker (task 4.1)', () => {
  it('Scenario: Five people are radio buttons in the server order, "Clocked in" and "Default" as text', async () => {
    answer(FIVE);
    renderStaff(<CollectorPicker saleId={IDS.SALE} value={AUNG.employee_id} onChange={() => {}} />);
    const radios = await screen.findAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('data-testid'))).toStrictEqual(
      FIVE.map((item) => `collector-${item.employee_id}`),
    );
    const group = screen.getByTestId('collector-picker');
    expect(
      Array.from(group.querySelectorAll('label')).map((label) => label.textContent),
    ).toStrictEqual([
      'Ko Aung · Clocked in · Default',
      'Ko Min · Clocked in',
      'Ma Hnin',
      'Ma Thida',
      'U Kyaw Zin',
    ]);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toStrictEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
  });

  it('eight people are a searchable list; choosing sends the choice up', async () => {
    const eight = [AUNG, MIN, ...[3, 4, 5, 6, 7, 8].map((n) => person(n, `Staff ${n}`))];
    answer(eight);
    const onChange = vi.fn();
    renderStaff(<CollectorPicker saleId={IDS.SALE} value={AUNG.employee_id} onChange={onChange} />);
    fireEvent.click(await screen.findByTestId('collector-picker'));
    expect(screen.getByRole('combobox', { name: 'Search staff' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('option', { name: /^Ko Min/ }));
    expect(onChange).toHaveBeenCalledWith(MIN.employee_id);
  });

  it('loading shows a skeleton; a failed load an error with Retry and no list', async () => {
    routeFetch(fetchMock, { [COLLECTORS]: json(500, problem(500, 'internal_error')) });
    renderStaff(<CollectorPicker saleId={IDS.SALE} value={null} onChange={() => {}} />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
  });
});

describe('PaymentSheet — "Collected by" (task 4.2)', () => {
  const sheet = () => {
    const onSubmit = vi.fn();
    renderStaff(
      <PaymentSheet
        saleId={IDS.SALE}
        open
        onOpenChange={() => {}}
        methods={[methodOf('CASH'), methodOf('KBZPAY')]}
        method={methodOf('KBZPAY')}
        remaining={moneyFromWire(10000)}
        pending={false}
        problem={null}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Reference/), { target: { value: 'KBZ0001234567' } });
    return onSubmit;
  };
  const shownName = (name: string) =>
    waitFor(() => expect(within(screen.getByTestId('collected-by')).getByText(name)).toBeTruthy());

  it('Scenario: KBZPay collected by a colleague — the default chip, Change, Ko Min, and the request names him', async () => {
    answer(FIVE);
    const onSubmit = sheet();
    await shownName('Ko Aung');
    fireEvent.click(screen.getByTestId('collector-change'));
    fireEvent.click(await screen.findByTestId(`collector-${MIN.employee_id}`));
    await shownName('Ko Min');
    fireEvent.click(screen.getByTestId('payment-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      payment_method_id: IDS.KBZPAY,
      amount: 10000n,
      external_reference: 'KBZ0001234567',
      collected_by_employee_id: MIN.employee_id,
    });
  });

  it('Scenario: The default is not sent — kept, or chosen again after another', async () => {
    answer(FIVE);
    const onSubmit = sheet();
    await shownName('Ko Aung');
    fireEvent.click(screen.getByTestId('payment-submit'));
    expect(onSubmit.mock.lastCall?.[0]).not.toHaveProperty('collected_by_employee_id');
    fireEvent.click(screen.getByTestId('collector-change'));
    fireEvent.click(await screen.findByTestId(`collector-${MIN.employee_id}`));
    await shownName('Ko Min');
    fireEvent.click(screen.getByTestId('collector-change'));
    fireEvent.click(await screen.findByTestId(`collector-${AUNG.employee_id}`));
    await shownName('Ko Aung');
    fireEvent.click(screen.getByTestId('payment-submit'));
    expect(onSubmit.mock.lastCall?.[0]).not.toHaveProperty('collected_by_employee_id');
  });

  it('a list that cannot be read still lets the payment go with the default', () => {
    routeFetch(fetchMock, { [COLLECTORS]: json(500, problem(500, 'internal_error')) });
    const onSubmit = sheet();
    fireEvent.click(screen.getByTestId('payment-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.lastCall?.[0]).not.toHaveProperty('collected_by_employee_id');
  });
});

describe('PaymentList — "Change" on a line (task 4.2)', () => {
  const lines = [
    paymentOf(),
    paymentOf({
      id: '0199a3f2-0000-7000-800a-000000000002',
      voided_at: '2026-10-05T10:50:00+06:30',
    }),
  ];
  const list = (props: Partial<Parameters<typeof PaymentList>[0]> = {}) => {
    const onChangeCollector = vi.fn().mockResolvedValue(true);
    renderStaff(
      <PaymentList
        saleId={IDS.SALE}
        payments={lines}
        methods={[methodOf('CASH')]}
        canVoid
        onVoid={() => {}}
        onChangeCollector={onChangeCollector}
        collectorPending={false}
        collectorProblem={null}
        {...props}
      />,
    );
    return onChangeCollector;
  };

  it('Scenario: Handing over after the payment — only the live line asks; the chip stays until the answer', async () => {
    answer(FIVE);
    const onChange = list();
    expect(screen.getAllByTestId('payment-collector-change')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('payment-collector-change'));
    fireEvent.click(await screen.findByTestId(`collector-${MIN.employee_id}`));
    expect(onChange).toHaveBeenCalledWith(IDS.PAYMENT, MIN.employee_id);
    await waitFor(() => expect(screen.queryByTestId('payment-collector-picker')).toBeNull());
    const [first] = screen.getAllByRole('listitem');
    expect(within(first as HTMLElement).getByText('Ko Aung')).toBeTruthy();
  });

  it('a refusal reads under the line with the picker still open', async () => {
    answer(FIVE);
    list({ collectorProblem: { code: 'not_assigned_to_branch', request_id: 'r' } });
    fireEvent.click(screen.getByTestId('payment-collector-change'));
    const picker = await screen.findByTestId('payment-collector-picker');
    expect(within(picker).getByRole('alert').textContent).toContain('not assigned to this branch');
  });

  it('in flight the control is disabled — one request at a time', () => {
    answer(FIVE);
    list({ collectorPending: true });
    expect((screen.getByTestId('payment-collector-change') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('Scenario: No change after Finish — no control without take_payment', () => {
    answer(FIVE);
    list({ canVoid: false });
    expect(screen.queryByTestId('payment-collector-change')).toBeNull();
  });
});
