// @vitest-environment jsdom
import {
  type QuoteItemDto,
  type ServiceCategoryDto,
  type ServiceListItemDto,
  ServicePricingMode,
} from '@point/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStaff } from '../../test/render';
import { ServicePicker } from './ServicePicker';

// add-walkin-visit-checkout task 11.4 (presentational part) — services-pricing spec "Services sold at B3"
// (AD-POS-05 · P2.SVC.01 · P2.PRC.06): search and categories, no "Frequent here"; rows with duration and
// the quote price for the performer on the visit date.
const CAT: ServiceCategoryDto = {
  id: '00000000-0000-4000-8000-000000000ca1',
  name_mm: 'ဝန်ဆောင်မှုများ',
  name_en: 'Services',
  sort_order: 1,
  status: 1,
  archived_at: null,
  updated_at: '2026-10-05T10:00:00+06:30',
};
const service = (
  n: number,
  name_en: string,
  name_mm: string,
  min: number,
  mode: number = ServicePricingMode.SIMPLE,
) =>
  ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    category_id: CAT.id,
    name_mm,
    name_en,
    pricing_mode: mode,
    buffer_minutes: 0,
    status: 1,
    show_on_website: true,
    sort_order: n,
    branch_ids: [],
    duration_range: { min, max: min },
    archived_at: null,
    updated_at: '2026-10-05T10:00:00+06:30',
  }) as ServiceListItemDto;
const SERVICES = [
  service(1, 'Haircut', 'ဆံပင်ညှပ်', 30),
  service(2, 'Shave', 'မုတ်ဆိတ်ရိတ်', 15),
  service(3, 'Hair wash', 'ခေါင်းလျှော်', 10),
  service(4, 'Colour', 'ဆံပင်ဆိုး', 60, ServicePricingMode.OPTIONS),
];
const quoted = (s: ServiceListItemDto, price: number): QuoteItemDto =>
  ({
    service_id: s.id,
    service_variant_id: null,
    sold: true,
    reason: null,
    unit_price_amount: price,
    duration_minutes: s.duration_range.min,
    buffer_minutes: 0,
  }) as QuoteItemDto;
const QUOTE = [quoted(SERVICES[0]!, 8000), quoted(SERVICES[1]!, 3000), quoted(SERVICES[2]!, 2000)];

function picker(extra: Partial<Parameters<typeof ServicePicker>[0]> = {}) {
  const onPick = vi.fn();
  renderStaff(
    <ServicePicker
      open
      onOpenChange={() => {}}
      services={SERVICES}
      categories={[CAT]}
      quote={QUOTE}
      pending={false}
      onPick={onPick}
      {...extra}
    />,
  );
  return onPick;
}

describe('ServicePicker (task 11.4)', () => {
  it('Scenario: Services sold at B3 — Haircut (30 min · 8,000 Ks), Shave, Hair wash under "Services"', () => {
    picker();
    const group = screen.getByRole('region', { name: 'Services' });
    const rows = within(group)
      .getAllByRole('button')
      .map((row) => row.textContent);
    expect(rows).toStrictEqual([
      'Haircut30 min · 8,000 Ks',
      'Shave15 min · 3,000 Ks',
      'Hair wash10 min · 2,000 Ks',
    ]);
    expect(screen.queryByText(/Frequent/)).toBeNull();
  });

  it('an option service is not offered in this change', () => {
    picker();
    expect(screen.queryByText('Colour')).toBeNull();
  });

  it('search narrows the list, in Myanmar too', () => {
    picker();
    fireEvent.change(screen.getByPlaceholderText('Search services'), { target: { value: 'sha' } });
    expect(screen.getAllByRole('button', { name: /Shave/ })).toHaveLength(1);
    expect(screen.queryByText('Haircut')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Search services'), { target: { value: 'zzz' } });
    expect(screen.getByText('No service found')).toBeTruthy();
  });

  it('a tap picks the service', () => {
    const onPick = picker();
    fireEvent.click(screen.getByTestId(`pick-${SERVICES[1]?.id}`));
    expect(onPick).toHaveBeenCalledWith(SERVICES[1]?.id);
  });

  it('while the quote loads: the duration from the list, no price yet', () => {
    picker({ quote: undefined });
    expect(screen.getByTestId(`pick-${SERVICES[0]?.id}`).textContent).toBe('Haircut30 min');
  });

  it('after COMPLETE: "Why was this added?" first, then the pick carries added_reason', async () => {
    const onPick = picker({ askReason: true });
    fireEvent.click(screen.getByTestId(`pick-${SERVICES[1]?.id}`));
    expect(onPick).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Why was this added?');
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Customer asked for a shave at the counter' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await vi.waitFor(() =>
      expect(onPick).toHaveBeenCalledWith(
        SERVICES[1]?.id,
        'Customer asked for a shave at the counter',
      ),
    );
  });
});
