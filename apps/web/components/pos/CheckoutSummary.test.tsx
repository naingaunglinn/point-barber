// @vitest-environment jsdom
import type { SaleDto } from '@point/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStaff } from '../../test/render';
import { CheckoutSummary } from './CheckoutSummary';

// add-walkin-visit-checkout task 12.1 (presentational part) — sales-checkout spec "The breakdown and the
// Myanmar format" (AD-POS-07 · AD-HELP-02 · AD-FMT-01).
const sale = (remaining: number, removedShave = false) =>
  ({
    total_amount: removedShave ? 8000 : 11000,
    remaining_amount: remaining,
    discount_amount: 0,
    service_charge_amount: 0,
    tax_amount: 0,
    items: [
      {
        id: 'i1',
        description_en: 'Haircut',
        description_mm: 'ဆံပင်ညှပ်',
        line_total_amount: 8000,
        removed_at: null,
      },
      {
        id: 'i2',
        description_en: 'Shave',
        description_mm: 'မုတ်ဆိတ်ရိတ်',
        line_total_amount: 3000,
        removed_at: removedShave ? '2026-10-05T10:20:00+06:30' : null,
      },
    ],
  }) as unknown as SaleDto;

describe('CheckoutSummary (task 12.1)', () => {
  it('Scenario: The breakdown and the Myanmar format — 8,000 ကျပ်, 3,000 ကျပ်, total 11,000 ကျပ်', () => {
    renderStaff(<CheckoutSummary sale={sale(11000)} />, { locale: 'my' });
    const breakdown = screen.getByTestId('checkout-breakdown');
    expect(breakdown.textContent).toContain('ဆံပင်ညှပ်8,000 ကျပ်');
    expect(breakdown.textContent).toContain('မုတ်ဆိတ်ရိတ်3,000 ကျပ်');
    expect(breakdown.textContent).toContain('11,000 ကျပ်');
    expect(breakdown.textContent).not.toMatch(/[၀-၉]/);
  });

  it('the total in English; a removed line is not in the breakdown; no zero discount / charge / tax lines', () => {
    renderStaff(<CheckoutSummary sale={sale(8000, true)} />);
    expect(screen.getByTestId('checkout-total').textContent).toBe('8,000 Ks');
    const breakdown = screen.getByTestId('checkout-breakdown');
    expect(breakdown.textContent).not.toContain('Shave');
    expect(breakdown.textContent).not.toContain('Discount');
    expect(breakdown.textContent).not.toContain('Tax');
  });

  it('the progress line: Payment current while money is missing, Finish current once paid', () => {
    const current = () =>
      [...screen.getByTestId('checkout-summary').querySelectorAll('[aria-current="step"]')].map(
        (step) => step.textContent,
      );
    const { unmount } = renderStaff(<CheckoutSummary sale={sale(3000)} />);
    expect(current().join()).toContain('Payment');
    unmount();
    renderStaff(<CheckoutSummary sale={sale(0)} />);
    expect(current().join()).toContain('Finish');
  });
});
