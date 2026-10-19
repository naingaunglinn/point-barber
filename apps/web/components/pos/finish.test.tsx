// @vitest-environment jsdom
import { type CustomerLookupDto, type SaleDto, moneyFromWire } from '@point/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStaff } from '../../test/render';
import type { CheckoutMoney } from './checkout-money';
import { FinishStep } from './FinishStep';
import { SuccessPanel } from './SuccessPanel';

// add-walkin-visit-checkout tasks 13.1, 13.2, 13.5 (presentational part) — customers spec "The Finish step
// looks a customer up by phone" and sales-checkout "The Finish step and the success screen" (AD-POS-12 ·
// AD-POS-13): phone open and optional, existing / new customer, the Finish button with the total and its
// disabled reasons; the success screen with number, total, payments, performer, change flag, no redirect.
const PAID: CheckoutMoney = { remaining: null, changeToReturn: null, finishBlocked: null };
const MA_SU: CustomerLookupDto = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Ma Su',
  phone: '09 7712 3456',
  status: 1,
  notes: null,
  last_visit_at: '2026-10-05T10:42:00+06:30',
  upcoming_bookings: [],
};

function finish(props: Partial<Parameters<typeof FinishStep>[0]> = {}) {
  const onFinish = vi.fn();
  const onPhone = vi.fn();
  const view = renderStaff(
    <FinishStep
      total={moneyFromWire(10000)}
      money={PAID}
      lookup={{ kind: 'none' }}
      onPhone={onPhone}
      pending={false}
      onFinish={onFinish}
      {...props}
    />,
  );
  return { onFinish, onPhone, view };
}

describe('FinishStep (tasks 13.1 / 13.2)', () => {
  it('Scenario: Seven taps, customer skips the phone — "Finish · 10,000 Ks" with no customer', () => {
    const { onFinish } = finish();
    const submit = screen.getByTestId('finish-submit');
    expect(submit.textContent).toBe('Finish · 10,000 Ks');
    fireEvent.click(submit);
    expect(onFinish).toHaveBeenCalledWith(null);
  });

  it('a complete phone is handed to the screen for the lookup', () => {
    const { onPhone } = finish();
    fireEvent.change(screen.getByLabelText('Customer phone (optional)'), {
      target: { value: '09 7712 3456' },
    });
    expect(onPhone).toHaveBeenLastCalledWith('+95977123456');
  });

  it('Returning customer — "Existing customer: Ma Su · last visit 05/Oct/2026", no Name field', () => {
    const { onFinish } = finish({ lookup: { kind: 'existing', customer: MA_SU } });
    fireEvent.change(screen.getByLabelText('Customer phone (optional)'), {
      target: { value: '09 7712 3456' },
    });
    expect(screen.getByTestId('finish-customer').textContent).toBe(
      'Existing customer: Ma Su · last visit 05/Oct/2026',
    );
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
    fireEvent.click(screen.getByTestId('finish-submit'));
    expect(onFinish).toHaveBeenCalledWith({ phone: '09 7712 3456' });
  });

  it('New customer — the Name is required, then sent', () => {
    const { onFinish } = finish({ lookup: { kind: 'new' } });
    fireEvent.change(screen.getByLabelText('Customer phone (optional)'), {
      target: { value: '09 4500 1122' },
    });
    expect(screen.getByTestId('finish-customer').textContent).toBe('New customer');
    fireEvent.click(screen.getByTestId('finish-submit'));
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByText('This field is required.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ko Phyo' } });
    fireEvent.click(screen.getByTestId('finish-submit'));
    expect(onFinish).toHaveBeenCalledWith({ phone: '09 4500 1122', name: 'Ko Phyo' });
  });

  it('Skip clears the phone and finishes without a customer', () => {
    const { onFinish, onPhone } = finish({ lookup: { kind: 'new' } });
    fireEvent.change(screen.getByLabelText('Customer phone (optional)'), {
      target: { value: '09 4500 1122' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onPhone).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByTestId('finish-submit'));
    expect(onFinish).toHaveBeenCalledWith(null);
  });

  it('Scenario: Finish stays disabled while money is missing — the reason under it', () => {
    const { onFinish } = finish({
      total: moneyFromWire(11000),
      money: { remaining: moneyFromWire(3000), changeToReturn: null, finishBlocked: 'remaining' },
    });
    const submit = screen.getByTestId('finish-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText('Take the remaining 3,000 Ks before you finish.')).toBeTruthy();
    fireEvent.click(submit);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('Scenario: Finish stays disabled on a cash excess — void the cash payment and take it again', () => {
    finish({ money: { remaining: null, changeToReturn: null, finishBlocked: 'cash_excess' } });
    expect((screen.getByTestId('finish-submit') as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText('Cash is more than the total. Void the cash payment and take it again.'),
    ).toBeTruthy();
  });
});

const finishedSale = (extra: Partial<SaleDto> = {}) =>
  ({
    id: '00000000-0000-4000-8000-0000000005a1',
    receipt_number: 'B3-2026-OCT-00001',
    total_amount: 10000,
    items: [
      {
        id: 'i1',
        removed_at: null,
        effective_performed_by: { id: 'e004', display_name: 'Ko Aung' },
      },
    ],
    payments: [
      {
        id: 'p1',
        payment_method: { id: 'm1', code: 'CASH', name_mm: 'ငွေသား', name_en: 'Cash', kind: 1 },
        amount: 10000,
        voided_at: null,
      },
    ],
    refunds: [],
    ...extra,
  }) as unknown as SaleDto;

describe('FinishStep — override and refusals (tasks 13.3 / 13.4)', () => {
  it('Scenario: a code holder finishes — the reason dialog first, then override_reason is sent', async () => {
    const { onFinish } = finish({ needsReason: true });
    fireEvent.click(screen.getByTestId('finish-submit'));
    expect(onFinish).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Ko Aung went home' },
    });
    fireEvent.click(
      within(dialog).getAllByRole('button', { name: 'Finish' }).at(-1) as HTMLElement,
    );
    await vi.waitFor(() => expect(onFinish).toHaveBeenCalledWith(null, 'Ko Aung went home'));
  });

  it('total_changed: the alert above the button (the screen reloads the new total)', () => {
    finish({
      problem: {
        code: 'total_changed',
        context: { total_amount: 11000 },
        request_id: '0199a3f2-7c1e',
      },
    });
    expect(screen.getByRole('alert').textContent).toContain('The total has changed.');
  });

  it('phone_invalid on the phone field', () => {
    finish({ problem: { code: 'phone_invalid', request_id: 'r' } });
    expect(screen.getByText('Enter a valid phone number.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Scenario: New phone without a name — validation on customer.name reads "required" on the Name', () => {
    finish({
      lookup: { kind: 'new' },
      problem: {
        code: 'validation',
        errors: [{ field: 'customer.name', code: 'invalid_type' }],
        request_id: 'r',
      },
    });
    expect(screen.getByText('This field is required.')).toBeTruthy();
  });

  it('payroll_finalized as an alert', () => {
    finish({ problem: { code: 'payroll_finalized', request_id: 'r' } });
    expect(screen.getByRole('alert').textContent).toContain('Payroll for this period is finalized');
  });
});

describe('SuccessPanel (task 13.5)', () => {
  it('Scenario: Seven taps — number, "10,000 Ks", "Cash 10,000 Ks", Ko Aung, View / share PDF, Next customer', () => {
    const onNext = vi.fn();
    const onShare = vi.fn();
    renderStaff(
      <SuccessPanel sale={finishedSale()} sharing={false} onShare={onShare} onNext={onNext} />,
    );
    expect(screen.getByTestId('success-number').textContent).toBe('B3-2026-OCT-00001');
    expect(screen.getByTestId('success-total').textContent).toBe('10,000 Ks');
    expect(screen.getByTestId('success-payments').textContent).toBe('Cash 10,000 Ks');
    expect(screen.getByText('Ko Aung')).toBeTruthy();
    expect(screen.queryByText(/Print/)).toBeNull();
    fireEvent.click(screen.getByTestId('success-share'));
    fireEvent.click(screen.getByTestId('success-next'));
    expect([onShare.mock.calls.length, onNext.mock.calls.length]).toStrictEqual([1, 1]);
  });

  it('Scenario: FINISH records the change — the flag "Change returned" with B3-RF-2026-OCT-00001', () => {
    renderStaff(
      <SuccessPanel
        sale={finishedSale({
          refunds: [
            {
              id: 'r1',
              kind: 2,
              amount: 2000,
              refund_receipt_number: 'B3-RF-2026-OCT-00001',
              refunded_at: '2026-10-05T11:15:00+06:30',
              automatic_change: true,
            },
          ],
        } as Partial<SaleDto>)}
        sharing={false}
        onShare={() => {}}
        onNext={() => {}}
      />,
    );
    expect(screen.getByTestId('success-change').textContent).toContain('Change returned');
    expect(screen.getByTestId('success-change').textContent).toContain('B3-RF-2026-OCT-00001');
  });

  it('Scenario: No automatic redirect — nothing is called without a tap', () => {
    vi.useFakeTimers();
    const onNext = vi.fn();
    renderStaff(
      <SuccessPanel sale={finishedSale()} sharing={false} onShare={() => {}} onNext={onNext} />,
    );
    vi.advanceTimersByTime(60_000);
    expect(onNext).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
