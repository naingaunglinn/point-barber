import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { moneyFromWire, type ReceiptView } from '@point/shared';

import { RECEIPT_VIEW } from '../../catalogue/receipt-view';
import { renderIntl } from '../../test/intl';
import { descriptionOf, ReceiptRenderer } from './ReceiptRenderer';

// ui-foundation "ReceiptRenderer shows a receipt in English in the order of the guideline"
// (AD-RCPT-01 · D-PAY-06 · D-DB-04) and the receipt labels of the owner's answer of 12/Oct/2026.

const slot = (name: string) => document.querySelector<HTMLElement>(`[data-slot="${name}"]`);

describe('ReceiptRenderer', () => {
  it('Scenario: Receipt is English in the Myanmar UI', () => {
    renderIntl(<ReceiptRenderer receipt={RECEIPT_VIEW} />, { locale: 'my' });
    const receipt = slot('receipt');
    expect(receipt?.getAttribute('lang')).toBe('en');
    expect(slot('receipt-number')?.textContent).toBe('B3-2026-OCT-00003');
    expect(receipt?.querySelector('time')?.textContent).toBe('05/Oct/2026 10:42 AM');
    expect(slot('receipt-branch')?.textContent).toContain('Point 3.0');
    expect(slot('receipt-head')?.textContent).toContain('BarberKo Min');
    expect(slot('receipt-customer')?.textContent).toBe('Ma Su09•••••456');

    const lines = within(slot('receipt-lines') as HTMLElement).getAllByRole('listitem');
    expect(lines.map((line) => line.textContent)).toEqual([
      'Haircut8,000 Ks1 × 8,000 Ks',
      'Shave3,000 Ks1 × 3,000 Ks',
    ]);
    // 8,000 + 3,000 = 11,000
    const totals = slot('receipt-totals')?.textContent;
    expect(totals).toBe('Subtotal11,000 KsTotal11,000 Ks');
    const payments = slot('receipt-payments')?.textContent;
    expect(payments).toBe('Cash5,000 KsKBZPayKBZ00012345676,000 Ks');
    expect(receipt?.textContent).not.toMatch(/ကျပ်/);
  });

  it('Scenario: Line without an English description', () => {
    const line = {
      ...RECEIPT_VIEW.lines[1]!,
      description_en: null,
      description_mm: 'မုတ်ဆိတ်ရိတ်',
    };
    expect(descriptionOf(line)).toBe('မုတ်ဆိတ်ရိတ်');
    expect(descriptionOf({ ...line, description_en: '  ' })).toBe('မုတ်ဆိတ်ရိတ်');
    renderIntl(<ReceiptRenderer receipt={{ ...RECEIPT_VIEW, lines: [line] }} />, { locale: 'en' });
    // Myanmar text inside the English receipt keeps its own language (AD-L10N-04).
    expect(screen.getByText('မုတ်ဆိတ်ရိတ်').getAttribute('lang')).toBe('my');
  });

  it('several performers: each line names its barber and there is no Barber line at the top', () => {
    const lines = RECEIPT_VIEW.lines.map((line, index) => ({
      ...line,
      performer: index === 0 ? 'Ko Min' : 'Ko Aung',
    }));
    renderIntl(
      <ReceiptRenderer receipt={{ ...RECEIPT_VIEW, barbers: ['Ko Min', 'Ko Aung'], lines }} />,
    );
    expect(slot('receipt-head')?.textContent).not.toContain('Barber');
    const items = within(slot('receipt-lines') as HTMLElement).getAllByRole('listitem');
    expect(items[0]?.textContent).toContain('BarberKo Min');
    expect(items[1]?.textContent).toContain('BarberKo Aung');
  });

  it('discount, service charge, tax and change returned appear only when given', () => {
    const view: ReceiptView = {
      ...RECEIPT_VIEW,
      discount_amount: moneyFromWire(1000),
      service_charge_amount: moneyFromWire(500),
      tax_amount: moneyFromWire(0),
      total_amount: moneyFromWire(10_500),
      change_returned: {
        amount: moneyFromWire(2000),
        refund_receipt_number: 'B3-RF-2026-OCT-00001',
      },
    };
    renderIntl(<ReceiptRenderer receipt={view} />);
    expect(slot('receipt-totals')?.textContent).toBe(
      'Subtotal11,000 KsApproved discount-1,000 KsService charge500 KsTax0 KsTotal10,500 Ks',
    );
    expect(slot('receipt-payments')?.textContent).toContain(
      'Change returned (cash)B3-RF-2026-OCT-000012,000 Ks',
    );
  });

  it('a discount code shows its own label', () => {
    renderIntl(
      <ReceiptRenderer
        receipt={{ ...RECEIPT_VIEW, discount_label: 'OCT10', discount_amount: moneyFromWire(1000) }}
      />,
    );
    expect(slot('receipt-totals')?.textContent).toContain('OCT10-1,000 Ks');
    expect(slot('receipt-totals')?.textContent).not.toContain('Approved discount');
  });

  it('a refund receipt has the title Refund and the original number', () => {
    renderIntl(
      <ReceiptRenderer
        receipt={{
          ...RECEIPT_VIEW,
          kind: 'refund',
          number: 'B3-RF-2026-OCT-00003',
          original_number: 'B3-2026-OCT-00003',
        }}
      />,
      { locale: 'my' },
    );
    const head = slot('receipt-head')?.textContent;
    expect(head).toContain('Refund');
    expect(head).toContain('Original receiptB3-2026-OCT-00003');
    expect(slot('receipt-number')?.textContent).toBe('B3-RF-2026-OCT-00003');
  });
});
