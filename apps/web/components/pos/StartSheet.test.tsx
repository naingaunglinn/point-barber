// @vitest-environment jsdom
import { ServicePricingMode, ServiceStatus, type ServiceListItemDto } from '@point/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { chooseTime } from '../../test/late-entry';
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
    expect(onStart).toHaveBeenCalledWith([], null);
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
    expect(onStart).toHaveBeenCalledWith([B3_SERVICES[0]?.id, B3_SERVICES[2]?.id], null);
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

  it('the link busy while the visit is read; a failed read as an alert under it, the link kept', () => {
    sheet({
      problem: { code: 'unpaid_visit_open', context: { visit_id: 'visit-b' }, request_id: 'r' },
      openingUnpaid: true,
      unpaidProblem: { code: 'not_found', request_id: 'r' },
    });
    const unpaid = screen.getByTestId('start-unpaid');
    const link = within(unpaid).getByRole('button', { name: 'Open the previous customer' });
    expect(link.getAttribute('aria-busy')).toBe('true');
    expect(within(unpaid).getByText("This item doesn't exist or was archived.")).toBeTruthy();
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

// add-late-entry tasks 4.1 – 4.3 — the late-entry section of the START sheet (AD-POS-14 · LE-2 ★ ·
// P4-RULE-13): behind `sale.late_entry`; the five reasons, the note only for OTHER, four required times;
// on Start the required fields first, then the order of the times — nothing is sent while one fails. The
// catalogue clock is Monday 05/Oct/2026 10:42 AM; the paper slip is yesterday's.
const fillTime = (key: string, label: string, time: string, date = '04/Oct/2026') => {
  const field = screen.getByTestId(`late-entry-${key}`);
  const input = within(field).getByRole('textbox', { name: `${label} — Date` });
  fireEvent.change(input, { target: { value: date } });
  fireEvent.blur(input);
  chooseTime(key, time);
};
const fillAll = (
  times: Partial<Record<'started' | 'completed' | 'received' | 'finished', string>> = {},
) => {
  fillTime('started', 'Actual start time', times.started ?? '15:00');
  fillTime('completed', 'Completed time', times.completed ?? '15:30');
  fillTime('received', 'Payment received time', times.received ?? '15:35');
  fillTime('finished', 'Finish time', times.finished ?? '15:35');
};

// Each test fills up to four late-entry dates and times (a 288-time combobox each): 4.7–5.1 s in a
// full `pnpm test` on 8 cores against the 5 s default, so these get 10 s (measured on #18, 02/Nov/2026).
describe('StartSheet — late entry (add-late-entry tasks 4.1 – 4.3)', { timeout: 10_000 }, () => {
  it('the link is absent without sale.late_entry (owner B12)', () => {
    sheet();
    expect(screen.queryByTestId('late-entry-link')).toBeNull();
  });

  it('Start with the section open and nothing filled — required under the reason and the four times, nothing sent', () => {
    const onStart = sheet({ allowLateEntry: true });
    fireEvent.click(screen.getByTestId('late-entry-link'));
    fireEvent.click(screen.getByTestId('start-submit'));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getAllByText('This field is required.')).toHaveLength(5);
  });

  it('OTHER shows the note, and it is required', () => {
    const onStart = sheet({ allowLateEntry: true });
    fireEvent.click(screen.getByTestId('late-entry-link'));
    expect(screen.queryByTestId('late-entry-note')).toBeNull();
    fireEvent.click(screen.getByTestId('late-entry-reason-9'));
    fillAll();
    fireEvent.click(screen.getByTestId('start-submit'));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a reason.')).toBeTruthy();
  });

  it('a completed time before the start — the order message under Completed time, nothing sent', () => {
    const onStart = sheet({ allowLateEntry: true });
    fireEvent.click(screen.getByTestId('late-entry-link'));
    fireEvent.click(screen.getByTestId('late-entry-reason-1'));
    fillAll({ completed: '14:55' });
    fireEvent.click(screen.getByTestId('start-submit'));
    expect(onStart).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId('late-entry-completed')).getByRole('alert').textContent,
    ).toMatch(/must be in order/);
  });

  it('a finish time after now is refused the same way', () => {
    const onStart = sheet({ allowLateEntry: true });
    fireEvent.click(screen.getByTestId('late-entry-link'));
    fireEvent.click(screen.getByTestId('late-entry-reason-1'));
    fillAll();
    fillTime('finished', 'Finish time', '11:00', '05/Oct/2026');
    fireEvent.click(screen.getByTestId('start-submit'));
    expect(onStart).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('late-entry-finished')).getByRole('alert')).toBeTruthy();
  });

  it("yesterday's paper slip in order — Start sends the reason and the four MMT times", () => {
    const onStart = sheet({ allowLateEntry: true });
    fireEvent.click(screen.getByTestId('late-entry-link'));
    fireEvent.click(screen.getByTestId('late-entry-reason-1'));
    fillAll();
    fireEvent.click(screen.getByTestId('start-submit'));
    expect(onStart).toHaveBeenCalledWith([], {
      reason: 1,
      started_at: '2026-10-04T15:00:00+06:30',
      completed_at: '2026-10-04T15:30:00+06:30',
      received_at: '2026-10-04T15:35:00+06:30',
      finished_at: '2026-10-04T15:35:00+06:30',
    });
  });

  it('the link closes the section again, and Start is a normal START', () => {
    const onStart = sheet({ allowLateEntry: true });
    fireEvent.click(screen.getByTestId('late-entry-link'));
    expect(screen.getByTestId('late-entry-link').textContent).toBe('Not a late entry');
    fireEvent.click(screen.getByTestId('late-entry-link'));
    fireEvent.click(screen.getByTestId('start-submit'));
    expect(onStart).toHaveBeenCalledWith([], null);
  });

  it('my: the link and the field labels are in Myanmar', () => {
    sheet({ allowLateEntry: true }, 'my');
    fireEvent.click(screen.getByTestId('late-entry-link'));
    expect(screen.getByText('တကယ် စခဲ့တဲ့ အချိန်')).toBeTruthy();
    expect(screen.getByText('အင်တာနက် ပြတ်')).toBeTruthy();
  });
});

// Each test fills up to four late-entry dates and times (a 288-time combobox each): 4.7–5.1 s in a
// full `pnpm test` on 8 cores against the 5 s default, so these get 10 s (measured on #18, 02/Nov/2026).
describe('StartSheet — late entry, review of #29', { timeout: 10_000 }, () => {
  it('a note typed for OTHER is not sent once another reason is chosen', () => {
    const onStart = sheet({ allowLateEntry: true });
    fireEvent.click(screen.getByTestId('late-entry-link'));
    fireEvent.click(screen.getByTestId('late-entry-reason-9'));
    fireEvent.change(screen.getByTestId('late-entry-note'), {
      target: { value: 'Paper slip' },
    });
    fireEvent.click(screen.getByTestId('late-entry-reason-4'));
    fillAll();
    fireEvent.click(screen.getByTestId('start-submit'));
    expect(onStart).toHaveBeenCalledWith(
      [],
      expect.not.objectContaining({ note: expect.anything() }),
    );
    expect(onStart.mock.calls[0]?.[1]).toMatchObject({ reason: 4 });
  });

  it('payroll_finalized from START shows its text in the sheet', () => {
    sheet({
      allowLateEntry: true,
      problem: { code: 'payroll_finalized', request_id: 'r1' },
    });
    expect(
      screen.getByText(
        'Payroll for this period is finalized — ask the admin to add a manual payroll line.',
      ),
    ).toBeTruthy();
  });
});
