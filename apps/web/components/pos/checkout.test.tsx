// @vitest-environment jsdom
import {
  type PaymentDto,
  type PaymentMethodDto,
  PaymentMethodKind,
  PaymentMethodStatus,
  maxMoney,
  moneyFromWire,
  moneyToWire,
  subtractMoney,
  sumMoney,
} from '@point/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStaff } from '../../test/render';
import { checkoutMoney } from './checkout-money';
import { MoneyStatus } from './MoneyStatus';
import { PaymentButtons } from './PaymentButtons';
import { PaymentList } from './PaymentList';

// add-walkin-visit-checkout tasks 12.2, 12.5, 12.6 (presentational part) — payments spec "Taking payment"
// (AD-POS-08 · D-PAY-01): Cash, KBZPay, Split, then the other methods; one request at a time; "Remaining to
// pay" / "Change to return" announced; payment lines with reference and collector, voided struck through,
// the void through the reason dialog, the cash "Customer gave" helper.
const method = (
  id: string,
  code: string,
  is_cash: boolean,
  sort_order: number,
): PaymentMethodDto => ({
  id,
  code,
  name_mm: code === 'CASH' ? 'ငွေသား' : code,
  name_en: code === 'CASH' ? 'Cash' : code === 'KBZPAY' ? 'KBZPay' : code,
  kind: is_cash ? PaymentMethodKind.CASH : PaymentMethodKind.MOBILE_WALLET,
  is_cash,
  requires_reference: !is_cash,
  requires_verification: false,
  reference_regex: null,
  is_system: code === 'CASH' || code === 'KBZPAY',
  sort_order,
  status: PaymentMethodStatus.ACTIVE,
  archived_at: null,
  updated_at: '2026-10-05T10:00:00+06:30',
});
const CASH = method('00000000-0000-4000-8000-0000000000c1', 'CASH', true, 2);
const KBZ = method('00000000-0000-4000-8000-0000000000c2', 'KBZPAY', false, 1);
const WAVE = method('00000000-0000-4000-8000-0000000000c3', 'WAVE', false, 3);

const payment = (
  m: PaymentMethodDto,
  amount: number,
  extra: Partial<PaymentDto> = {},
): PaymentDto =>
  ({
    id: `00000000-0000-4000-8000-${String(amount).padStart(12, '0')}`,
    payment_method: {
      id: m.id,
      code: m.code,
      name_mm: m.name_mm,
      name_en: m.name_en,
      kind: m.kind,
    },
    amount,
    external_reference: null,
    collected_by: { id: 'e005', display_name: 'Ko Min' },
    voided_at: null,
    ...extra,
  }) as unknown as PaymentDto;

describe('PaymentButtons (task 12.2)', () => {
  it('Cash, KBZPay, Split, then the other methods — whatever the sort order says', () => {
    renderStaff(
      <PaymentButtons
        methods={[WAVE, KBZ, CASH]}
        remaining={moneyFromWire(8000)}
        pending={false}
        onMethod={() => {}}
        onSplit={() => {}}
      />,
    );
    const labels = within(screen.getByTestId('payment-buttons'))
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(labels).toStrictEqual(['Cash', 'KBZPay', 'Split', 'WAVE']);
  });

  it('Scenario: One tap, full cash — the Cash tap hands the method to the screen', () => {
    const onMethod = vi.fn();
    renderStaff(
      <PaymentButtons
        methods={[CASH, KBZ]}
        remaining={moneyFromWire(10000)}
        pending={false}
        onMethod={onMethod}
        onSplit={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('pay-CASH'));
    expect(onMethod).toHaveBeenCalledWith(CASH);
  });

  it('a payment in flight: every button busy, a second tap records nothing', () => {
    const onMethod = vi.fn();
    renderStaff(
      <PaymentButtons
        methods={[CASH, KBZ]}
        remaining={moneyFromWire(10000)}
        pending
        onMethod={onMethod}
        onSplit={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('pay-CASH'));
    fireEvent.click(screen.getByTestId('pay-KBZPAY'));
    expect(onMethod).not.toHaveBeenCalled();
  });

  it('nothing remaining → no payment buttons', () => {
    renderStaff(
      <PaymentButtons
        methods={[CASH, KBZ]}
        remaining={moneyFromWire(0)}
        pending={false}
        onMethod={() => {}}
        onSplit={() => {}}
      />,
    );
    expect(screen.queryByTestId('payment-buttons')).toBeNull();
  });

  it('Myanmar names of the methods', () => {
    renderStaff(
      <PaymentButtons
        methods={[CASH, KBZ]}
        remaining={moneyFromWire(10000)}
        pending={false}
        onMethod={() => {}}
        onSplit={() => {}}
      />,
      { locale: 'my' },
    );
    expect(screen.getByTestId('pay-CASH').textContent).toBe('ငွေသား');
    expect(screen.getByTestId('pay-split').textContent).toBe('ခွဲပေး');
  });
});

describe('MoneyStatus (task 12.6)', () => {
  const status = (total: number, paid: PaymentDto[]) => {
    const due = moneyFromWire(total);
    const sum = sumMoney(paid.map((p) => moneyFromWire(p.amount)));
    const zero = moneyFromWire(0);
    return checkoutMoney(
      {
        remaining_amount: moneyToWire(maxMoney(subtractMoney(due, sum), zero)),
        change_due_amount: moneyToWire(maxMoney(subtractMoney(sum, due), zero)),
        payments: paid,
      },
      [CASH, KBZ],
    );
  };

  it('Scenario: Split — "Remaining to pay: 6,000 Ks", announced', () => {
    renderStaff(<MoneyStatus money={status(11000, [payment(CASH, 5000)])} />);
    expect(screen.getByTestId('money-remaining').textContent).toBe('Remaining to pay: 6,000 Ks');
    expect(screen.getByTestId('money-status').getAttribute('aria-live')).toBe('polite');
  });

  it('Scenario: KBZPay 10,000 for a haircut of 8,000 — "Change to return: 2,000 Ks"', () => {
    renderStaff(<MoneyStatus money={status(8000, [payment(KBZ, 10000)])} />);
    expect(screen.getByTestId('money-change').textContent).toBe('Change to return: 2,000 Ks');
    expect(screen.queryByTestId('money-remaining')).toBeNull();
  });

  it('a cash excess shows no change line', () => {
    renderStaff(<MoneyStatus money={status(8000, [payment(CASH, 11000)])} />);
    expect(screen.queryByTestId('money-change')).toBeNull();
  });
});

describe('PaymentList (task 12.5)', () => {
  it('method, amount, reference and collector; a voided payment struck through with no actions', () => {
    renderStaff(
      <PaymentList
        payments={[
          payment(CASH, 5000, { voided_at: '2026-10-05T10:45:00+06:30' } as Partial<PaymentDto>),
          payment(KBZ, 6000, { external_reference: 'KBZ0001234567' } as Partial<PaymentDto>),
        ]}
        methods={[CASH, KBZ]}
        canVoid
        onVoid={() => {}}
      />,
    );
    const [voided, kbz] = within(screen.getByTestId('payment-list')).getAllByRole('listitem');
    expect(voided?.getAttribute('data-voided')).toBe('true');
    expect(voided?.querySelector('.line-through')).not.toBeNull();
    expect(
      within(voided as HTMLElement).queryByRole('button', { name: 'Void payment' }),
    ).toBeNull();
    expect(within(kbz as HTMLElement).getByTestId('payment-reference').textContent).toBe(
      'KBZ0001234567',
    );
    expect(within(kbz as HTMLElement).getByText('Ko Min')).toBeTruthy();
  });

  it('Void payment asks for the reason and sends it', async () => {
    const onVoid = vi.fn();
    renderStaff(
      <PaymentList
        payments={[payment(CASH, 8000)]}
        methods={[CASH, KBZ]}
        canVoid
        onVoid={onVoid}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Void payment' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Cash 8,000 Ks');
    const field = within(dialog).getByRole('textbox');
    fireEvent.change(field, { target: { value: 'Wrong amount' } });
    const confirm = within(dialog)
      .getAllByRole('button', { name: 'Void payment' })
      .at(-1) as HTMLElement;
    fireEvent.click(confirm);
    await vi.waitFor(() =>
      expect(onVoid).toHaveBeenCalledWith(payment(CASH, 8000).id, 'Wrong amount'),
    );
  });

  it('a closed sale (no take_payment) shows no void button and no helper', () => {
    renderStaff(
      <PaymentList
        payments={[payment(CASH, 8000)]}
        methods={[CASH]}
        canVoid={false}
        onVoid={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Void payment' })).toBeNull();
    expect(screen.queryByLabelText('Customer gave')).toBeNull();
  });

  it('"Customer gave" 10,000 on a cash line of 8,000 shows the change 2,000 — never on KBZPay', () => {
    renderStaff(
      <PaymentList
        payments={[payment(CASH, 8000), payment(KBZ, 3000)]}
        methods={[CASH, KBZ]}
        canVoid
        onVoid={() => {}}
      />,
    );
    const fields = screen.getAllByLabelText('Customer gave');
    expect(fields).toHaveLength(1);
    fireEvent.change(fields[0] as HTMLElement, { target: { value: '10000' } });
    expect(screen.getByTestId('cash-change').textContent).toBe('Change: 2,000 Ks');
  });
});
