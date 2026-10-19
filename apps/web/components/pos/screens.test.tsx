// @vitest-environment jsdom
import type { ReceiptViewDto, SaleDto } from '@point/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStaff } from '../../test/render';
import { ArrivalStep } from './ArrivalStep';
import { FinishedSale } from './FinishedSale';
import { OfflineHelp } from './OfflineHelp';
import { shareReceiptPdf } from './share-receipt';
import { VisitActions } from './VisitActions';
import { WarningNotes } from './WarningNotes';

// add-walkin-visit-checkout tasks 10.5, 10.10, 11.5, 11.6, 13.6, 13.7 (presentational part).
describe('ArrivalStep (task 10.5)', () => {
  it('one big Walk-in button — no "Has a booking" yet', () => {
    const onWalkIn = vi.fn();
    renderStaff(<ArrivalStep onWalkIn={onWalkIn} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Walk-in' }));
    expect(onWalkIn).toHaveBeenCalledOnce();
  });
});

describe('OfflineHelp (task 10.10)', () => {
  it('Scenario: The help page — paper and Late entry, no form and no button', () => {
    renderStaff(<OfflineHelp />);
    const page = screen.getByTestId('offline-help');
    expect(page.textContent).toContain('Write the service on paper');
    expect(page.textContent).toContain('Late entry');
    expect(within(page).queryByRole('button')).toBeNull();
    expect(page.querySelector('form, input, textarea')).toBeNull();
  });
});

describe('WarningNotes (task 11.5)', () => {
  it('Scenario: Not eligible, still recorded — the note', () => {
    renderStaff(<WarningNotes warnings={[{ code: 'not_eligible' } as never]} />);
    expect(screen.getByTestId('warning-not-eligible').textContent).toContain('Recorded');
  });

  it('Scenario: Eligible, no warning — nothing', () => {
    renderStaff(<WarningNotes warnings={[]} />);
    expect(screen.queryByTestId('warning-not-eligible')).toBeNull();
  });
});

describe('VisitActions (task 11.6)', () => {
  it('"Service done · Take payment" completes; Mark incomplete asks the reason', async () => {
    const onComplete = vi.fn();
    const onIncomplete = vi.fn();
    renderStaff(
      <VisitActions
        canComplete
        canMarkIncomplete
        pending={false}
        onComplete={onComplete}
        onIncomplete={onIncomplete}
      />,
    );
    fireEvent.click(screen.getByTestId('visit-done'));
    expect(onComplete).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Mark incomplete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('no revenue and no commission');
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Started by mistake' },
    });
    fireEvent.click(
      within(dialog).getAllByRole('button', { name: 'Mark incomplete' }).at(-1) as HTMLElement,
    );
    await vi.waitFor(() => expect(onIncomplete).toHaveBeenCalledWith('Started by mistake'));
  });

  it('service_required as an alert; no rights → no controls', () => {
    renderStaff(
      <VisitActions
        canComplete={false}
        canMarkIncomplete={false}
        pending={false}
        problem={{ code: 'service_required', request_id: 'r' }}
        onComplete={() => {}}
        onIncomplete={() => {}}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Add at least one service first.');
    expect(screen.queryByTestId('visit-done')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark incomplete' })).toBeNull();
  });
});

describe('shareReceiptPdf (task 13.6)', () => {
  const pdf = new Blob(['%PDF-'], { type: 'application/pdf' });

  it('Scenario: PDF on an iPhone — the share sheet when files can be shared', async () => {
    const share = vi.fn(async () => {});
    const open = vi.fn();
    const outcome = await shareReceiptPdf(
      pdf,
      'B3-2026-OCT-00001.pdf',
      { canShare: () => true, share },
      open,
    );
    expect(outcome).toBe('shared');
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'B3-2026-OCT-00001.pdf', files: [expect.any(File)] }),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('no file sharing (desktop) → opens the PDF in a new tab', async () => {
    const open = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:receipt');
    expect(await shareReceiptPdf(pdf, 'r.pdf', {}, open)).toBe('opened');
    expect(open).toHaveBeenCalledWith('blob:receipt');
  });

  it('the share sheet closed by the user is not an error', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('closed', 'AbortError');
    });
    expect(await shareReceiptPdf(pdf, 'r.pdf', { canShare: () => true, share }, vi.fn())).toBe(
      'cancelled',
    );
  });
});

describe('FinishedSale (task 13.7)', () => {
  const sale = {
    receipt_number: 'B3-2026-OCT-00001',
    finished_at: '2026-10-05T10:42:00+06:30',
    finished_by: { user_id: 'u1', display_name: 'Ko Aung' },
  } as unknown as SaleDto;
  const receipt: ReceiptViewDto = {
    kind: 'sale',
    number: 'B3-2026-OCT-00001',
    original_number: null,
    issued_at: '2026-10-05T10:42:00+06:30',
    branch: { name: 'Point 3.0', address: null, phone: null, logo_url: null },
    barbers: ['Ko Aung'],
    customer_name: null,
    customer_phone_masked: null,
    lines: [
      {
        description_en: 'Haircut',
        description_mm: 'ဆံပင်ညှပ်',
        option: null,
        performer: 'Ko Aung',
        quantity: 1,
        unit_price_amount: 10000,
        amount: 10000,
      },
    ],
    subtotal_amount: 10000,
    discount_label: null,
    discount_amount: 0,
    service_charge_amount: null,
    tax_amount: null,
    total_amount: 10000,
    payments: [{ method: 'Cash', amount: 10000, reference: null }],
    change_returned: null,
    footer: { opening_hours: 'Mon–Sun 9:00 AM – 9:00 PM', thank_you: null },
    pdf_attachment_id: null,
    png_attachment_id: null,
    rendered_at: null,
  };

  it('Scenario: The finished sale on screen — lock banner, the receipt as text, no edit control', () => {
    const onShare = vi.fn();
    renderStaff(<FinishedSale sale={sale} receipt={receipt} sharing={false} onShare={onShare} />);
    const view = screen.getByTestId('finished-sale');
    expect(view.textContent).toContain('Finished 05/Oct/2026 10:42 AM by Ko Aung');
    expect(view.textContent).toContain('Use Refund / Adjustment');
    expect(view.textContent).toContain('B3-2026-OCT-00001');
    expect(view.textContent).toContain('10,000');
    expect(view.querySelector('input, textarea')).toBeNull();
    const buttons = within(view)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(buttons).toStrictEqual(['View / share PDF']);
    fireEvent.click(screen.getByTestId('finished-share'));
    expect(onShare).toHaveBeenCalledOnce();
  });
});
