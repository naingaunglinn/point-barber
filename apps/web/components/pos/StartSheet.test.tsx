// @vitest-environment jsdom
import { ServicePricingMode, ServiceStatus, type ServiceListItemDto } from '@point/shared';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStaff } from '../../test/render';
import { StartSheet } from './StartSheet';

// add-walkin-visit-checkout task 10.7 (presentational part) — visits spec "The START sheet offers the
// first six simple services" and "Start a walk-in" (AD-POS-03 · D-VIS-02): branch, performer chip,
// optional chips, one Start with its in-flight state.
const service = (
  n: number,
  name_en: string,
  name_mm: string,
  mode: number = ServicePricingMode.SIMPLE,
) =>
  ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    category_id: '00000000-0000-4000-8000-000000000999',
    name_mm,
    name_en,
    pricing_mode: mode,
    buffer_minutes: 0,
    status: ServiceStatus.ACTIVE,
    show_on_website: true,
    sort_order: n,
    branch_ids: [],
    duration_range: { min: 30, max: 30 },
    archived_at: null,
    updated_at: '2026-10-05T10:00:00+06:30',
  }) as ServiceListItemDto;

const B3_SERVICES = [
  service(1, 'Haircut', 'ဆံပင်ညှပ်'),
  service(2, 'Shave', 'မုတ်ဆိတ်ရိတ်'),
  service(3, 'Hair wash', 'ခေါင်းလျှော်'),
  service(4, 'Colour', 'ဆံပင်ဆိုး', ServicePricingMode.OPTIONS),
];

function sheet(props: Partial<Parameters<typeof StartSheet>[0]> = {}, locale: 'en' | 'my' = 'en') {
  const onStart = vi.fn();
  renderStaff(
    <StartSheet
      open
      onOpenChange={() => {}}
      branch={{ id: 'b3', name: 'Point 3.0' }}
      performer={{ name: 'Ko Aung' }}
      services={B3_SERVICES}
      pending={false}
      onStart={onStart}
      {...props}
    />,
    { locale },
  );
  return onStart;
}

describe('StartSheet (task 10.7)', () => {
  it('Scenario: Three services at B3 — branch, my chip, chips Haircut, Shave, Hair wash; Colour is not a chip', () => {
    sheet();
    expect(screen.getByTestId('start-branch').textContent).toBe('Point 3.0');
    expect(screen.getByText('Ko Aung')).toBeTruthy();
    const chips = screen.getByTestId('start-chips').querySelectorAll('button');
    expect([...chips].map((chip) => chip.textContent)).toStrictEqual([
      'Haircut',
      'Shave',
      'Hair wash',
    ]);
  });

  it('Start with no service — one tap (a service is optional at START)', () => {
    const onStart = sheet();
    fireEvent.click(screen.getByTestId('start-submit'));
    expect(onStart).toHaveBeenCalledWith([]);
  });

  it('chips toggle; Start sends the chosen ids in chip order', () => {
    const onStart = sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Hair wash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Haircut' }));
    expect(screen.getByRole('button', { name: 'Haircut' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Shave' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shave' }));
    fireEvent.click(screen.getByTestId('start-submit'));
    expect(onStart).toHaveBeenCalledWith([B3_SERVICES[0]?.id, B3_SERVICES[2]?.id]);
  });

  it('while START runs the button is busy and a second tap sends nothing', () => {
    const onStart = sheet({ pending: true });
    const submit = screen.getByTestId('start-submit');
    fireEvent.click(submit);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('Myanmar: the labels and the Myanmar service names', () => {
    sheet({}, 'my');
    expect(screen.getByRole('button', { name: 'ဆံပင်ညှပ်' })).toBeTruthy();
    expect(screen.getByTestId('start-submit').textContent).toContain('စမယ်');
  });

  it('services still loading — no chips, Start is still there', () => {
    sheet({ services: undefined });
    expect(screen.queryByTestId('start-chips')).toBeNull();
    expect(screen.getByTestId('start-submit')).toBeTruthy();
  });

  it('Scenario: Awaiting payment blocks the next customer — the message and a link to visit B', () => {
    const onOpenUnpaid = vi.fn();
    sheet({
      problem: { code: 'unpaid_visit_open', context: { visit_id: 'visit-b' }, request_id: 'r' },
      onOpenUnpaid,
    });
    expect(screen.getByTestId('start-unpaid').textContent).toContain(
      'Finish payment for your previous customer first.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open the previous customer' }));
    expect(onOpenUnpaid).toHaveBeenCalledWith('visit-b');
  });

  it('Scenario: START on a closed day — "This day is closed — ask an admin to reopen it."', () => {
    sheet({
      problem: { code: 'day_closed', context: { business_date: '2026-10-05' }, request_id: 'r' },
    });
    expect(screen.getByText('This day is closed — ask an admin to reopen it.')).toBeTruthy();
  });

  it('not_assigned_to_branch as an alert', () => {
    sheet({ problem: { code: 'not_assigned_to_branch', request_id: '0199a3f2-7c1e' } });
    expect(screen.getByRole('alert').textContent).toContain(
      'This person is not assigned to this branch on this date.',
    );
  });
});
