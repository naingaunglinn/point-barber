// @vitest-environment jsdom
import type { SaleItemDto, VisitDto } from '@point/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStaff } from '../../test/render';
import { SaleLines } from './SaleLines';
import { VisitHeader } from './VisitHeader';

// add-walkin-visit-checkout tasks 11.2 / 11.3 (presentational part) — visits spec "The visit screen"
// (AD-POS-04 · AD-POS-06 · AD-POS-11 · D-VIS-05): the sticky header with customer or Walk-in, performer,
// branch, start time and minutes; the lines with price, duration and performer, a removed line struck
// through, removal with a reason.
const visit = (customer: string | null = null) =>
  ({
    id: 'v1',
    started_at: '2026-10-05T10:02:00+06:30',
    performed_by: { id: 'e004', display_name: 'Ko Aung' },
    sale: { customer: customer === null ? null : { id: 'c1', name: customer, phone: '' } },
  }) as unknown as VisitDto;

const item = (id: string, en: string, mm: string, price: number, removed = false) =>
  ({
    id,
    service_id: `svc-${id}`,
    description_en: en,
    description_mm: mm,
    unit_price_amount: price,
    removed_at: removed ? '2026-10-05T10:20:00+06:30' : null,
    effective_performed_by: { id: 'e004', display_name: 'Ko Aung' },
  }) as unknown as SaleItemDto;

describe('VisitHeader (task 11.2)', () => {
  it('Walk-in, Ko Aung, Point 3.0, "Started 10:02 AM · 40 min"', () => {
    renderStaff(<VisitHeader visit={visit()} branchName="Point 3.0" />);
    expect(screen.getByTestId('visit-customer').textContent).toBe('Walk-in');
    expect(screen.getByText('Ko Aung')).toBeTruthy();
    expect(screen.getByText('Point 3.0')).toBeTruthy();
    expect(screen.getByTestId('visit-started').textContent).toBe('Started 10:02 AM · 40 min');
  });

  it('the customer name once the sale has one; Myanmar labels', () => {
    renderStaff(<VisitHeader visit={visit('Ma Su')} branchName="Point 3.0" />, { locale: 'my' });
    expect(screen.getByTestId('visit-customer').textContent).toBe('Ma Su');
    expect(screen.getByTestId('visit-started').textContent).toContain('စတဲ့အချိန်');
  });
});

describe('SaleLines (task 11.3)', () => {
  const lines = [
    item('1', 'Haircut', 'ဆံပင်ညှပ်', 8000),
    item('2', 'Shave', 'မုတ်ဆိတ်ရိတ်', 3000, true),
  ];

  it('name, price, duration and performer; a removed line struck through without Remove', () => {
    renderStaff(
      <SaleLines items={lines} durations={new Map([['svc-1', 30]])} canEdit onRemove={() => {}} />,
    );
    const [haircut, shave] = within(screen.getByTestId('sale-lines')).getAllByRole('listitem');
    expect(haircut?.textContent).toContain('Haircut');
    expect(haircut?.textContent).toContain('8,000 Ks');
    expect(haircut?.textContent).toContain('30 min');
    expect(haircut?.textContent).toContain('Ko Aung');
    expect(shave?.getAttribute('data-removed')).toBe('true');
    expect(shave?.querySelector('.line-through')).not.toBeNull();
    expect(within(shave as HTMLElement).queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('Remove asks for the reason and sends it', async () => {
    const onRemove = vi.fn();
    renderStaff(<SaleLines items={lines} canEdit onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Haircut stays on the sale');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Wrong service' } });
    fireEvent.click(
      within(dialog).getAllByRole('button', { name: 'Remove' }).at(-1) as HTMLElement,
    );
    await vi.waitFor(() => expect(onRemove).toHaveBeenCalledWith('1', 'Wrong service'));
  });

  it('no edit_lines → no Remove', () => {
    renderStaff(<SaleLines items={lines} canEdit={false} onRemove={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});
