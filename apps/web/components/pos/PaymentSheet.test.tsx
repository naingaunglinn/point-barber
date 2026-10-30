// @vitest-environment jsdom
import {
  type PaymentMethodDto,
  PaymentMethodKind,
  PaymentMethodStatus,
  moneyFromWire,
} from '@point/shared';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStaff } from '../../test/render';
import { PaymentSheet, type PaymentSheetProps } from './PaymentSheet';

// add-walkin-visit-checkout tasks 12.3, 12.4, 12.7 (presentational part) — payments spec "Taking payment"
// and "A reference is used only once" (AD-POS-08 · AD-FORM-12 · AD-FORM-04): KBZPay sheet with the
// amount preset and the reference required with its format helper; Split with the method choice; the
// server's refusals on their field.
const method = (
  id: string,
  code: string,
  is_cash: boolean,
  regex: string | null = null,
): PaymentMethodDto => ({
  id,
  code,
  name_mm: code,
  name_en: code === 'CASH' ? 'Cash' : code === 'KBZPAY' ? 'KBZPay' : code,
  kind: is_cash ? PaymentMethodKind.CASH : PaymentMethodKind.MOBILE_WALLET,
  is_cash,
  requires_reference: !is_cash,
  requires_verification: false,
  reference_regex: regex,
  is_system: true,
  sort_order: is_cash ? 1 : 2,
  status: PaymentMethodStatus.ACTIVE,
  archived_at: null,
  updated_at: '2026-10-05T10:00:00+06:30',
});
const CASH = method('00000000-0000-4000-8000-0000000000c1', 'CASH', true);
const KBZ = method('00000000-0000-4000-8000-0000000000c2', 'KBZPAY', false, '^KBZ[0-9]{10}$');

function sheet(props: Partial<PaymentSheetProps> = {}) {
  const onSubmit = vi.fn();
  renderStaff(
    <PaymentSheet
      open
      onOpenChange={() => {}}
      methods={[CASH, KBZ]}
      remaining={moneyFromWire(8000)}
      pending={false}
      problem={null}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return onSubmit;
}

describe('PaymentSheet — KBZPay (task 12.3)', () => {
  it('Scenario: KBZPay opens the reference sheet — 8,000 preset, empty reference, the format as helper', () => {
    sheet({ method: KBZ });
    expect((screen.getByLabelText(/^Amount/) as HTMLInputElement).value).toBe('8,000');
    expect((screen.getByLabelText(/^Reference/) as HTMLInputElement).value).toBe('');
    expect(screen.getByText('KBZ followed by 10 digits')).toBeTruthy();
  });

  it('nothing is sent without the reference', () => {
    const onSubmit = sheet({ method: KBZ });
    fireEvent.click(screen.getByTestId('payment-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Enter the reference number.')).toBeTruthy();
  });

  it('the trimmed reference and the amount are sent; an over-transfer amount may be typed', () => {
    const onSubmit = sheet({ method: KBZ });
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText(/^Reference/), {
      target: { value: '  KBZ0001234568 ' },
    });
    fireEvent.click(screen.getByTestId('payment-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      payment_method_id: KBZ.id,
      amount: 10000n,
      external_reference: 'KBZ0001234568',
    });
  });

  it('duplicate_reference with a receipt number → "This reference was already used on B3-2026-OCT-00002"', () => {
    sheet({
      method: KBZ,
      problem: {
        code: 'duplicate_reference',
        context: { receipt_number: 'B3-2026-OCT-00002' },
        request_id: 'r',
      },
    });
    expect(screen.getByText('This reference was already used on B3-2026-OCT-00002.')).toBeTruthy();
  });

  it('duplicate_reference while the other sale is open → pos.checkout.referenceInUse', () => {
    sheet({
      method: KBZ,
      problem: { code: 'duplicate_reference', context: { receipt_number: null }, request_id: 'r' },
    });
    expect(screen.getByTestId('reference-in-use').textContent).toBe(
      'This reference is already recorded. Check the transfer.',
    );
  });

  it('reference_format on the reference field', () => {
    sheet({ method: KBZ, problem: { code: 'reference_format', request_id: 'r' } });
    expect(screen.getByText('This reference number is not in the right format.')).toBeTruthy();
  });

  it('a refusal for the whole request is an alert', () => {
    sheet({ method: KBZ, problem: { code: 'day_closed', request_id: '0199a3f2-7c1e' } });
    expect(screen.getByRole('alert').textContent).toContain('This day is closed');
  });
});

describe('PaymentSheet — Split (task 12.4)', () => {
  it('Scenario: Split Cash + KBZPay — Cash 5,000 first, with "Customer gave" showing the change', () => {
    const onSubmit = sheet({ remaining: moneyFromWire(11000) });
    expect(screen.getByRole('radio', { name: 'Cash' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('Customer gave'), { target: { value: '10000' } });
    expect(screen.getByTestId('sheet-cash-change').textContent).toBe('Change: 5,000 Ks');
    fireEvent.click(screen.getByTestId('payment-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ payment_method_id: CASH.id, amount: 5000n });
  });

  it('choosing KBZPay asks for the reference; amount_exceeds_remaining shows on the amount', () => {
    sheet({
      remaining: moneyFromWire(6000),
      problem: { code: 'amount_exceeds_remaining', request_id: 'r' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'KBZPay' }));
    expect(screen.getByLabelText(/^Reference/)).toBeTruthy();
    expect(screen.getByText('This amount is more than the amount left to pay.')).toBeTruthy();
  });

  it('an empty amount is not sent', () => {
    const onSubmit = sheet();
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('payment-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
