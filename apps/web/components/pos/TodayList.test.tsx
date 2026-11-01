// @vitest-environment jsdom
import { type VisitDto, VisitStatus } from '@point/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStaff } from '../../test/render';
import { TodayList } from './TodayList';

// add-walkin-visit-checkout tasks 10.3 / 10.4 (presentational part) — visits spec "Today lists my open
// visits" (AD-TODAY-01 · AD-TODAY-02 · AD-CMP-05 · AD-STATE-01..03): oldest first, customer or Walk-in,
// services, status and minutes, next action; skeleton, empty state with Start, error state with Retry.
const visit = (
  id: string,
  status: number,
  started_at: string,
  items: { en: string; mm: string }[],
  customer: { name: string } | null = null,
) =>
  ({
    id,
    status,
    started_at,
    sale: {
      id: `sale-${id}`,
      customer: customer === null ? null : { id: 'c1', name: customer.name, phone: '09 7712 3456' },
      items: items.map((item, i) => ({
        id: `${id}-${i}`,
        description_en: item.en,
        description_mm: item.mm,
        removed_at: null,
      })),
    },
  }) as unknown as VisitDto;

const HAIRCUT = { en: 'Haircut', mm: 'ဆံပင်ညှပ်' };
const SHAVE = { en: 'Shave', mm: 'မုတ်ဆိတ်ရိတ်' };

describe('TodayList (tasks 10.3 / 10.4)', () => {
  it('oldest first; Walk-in or the customer; services; status and minutes; the next action', () => {
    const onOpen = vi.fn();
    renderStaff(
      <TodayList
        visits={[
          visit('b', VisitStatus.STARTED, '2026-10-05T10:30:00+06:30', [HAIRCUT, SHAVE], {
            name: 'Ma Su',
          }),
          visit('a', VisitStatus.COMPLETED, '2026-10-05T10:02:00+06:30', [HAIRCUT]),
        ]}
        onOpen={onOpen}
        onStart={() => {}}
      />,
    );
    const cards = screen.getAllByRole('listitem');
    expect(cards[0]?.textContent).toContain('Walk-in');
    expect(cards[0]?.textContent).toContain('Awaiting payment');
    expect(cards[0]?.textContent).toContain('40 min');
    expect(cards[1]?.textContent).toContain('Ma Su');
    expect(cards[1]?.textContent).toContain('Haircut, Shave');
    expect(cards[1]?.textContent).toContain('In service');
    fireEvent.click(within(cards[0] as HTMLElement).getByRole('button', { name: 'Take payment' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(
      within(cards[1] as HTMLElement).getByRole('button', { name: 'Service done' }),
    ).toBeTruthy();
  });

  it('Myanmar: Myanmar service names and labels', () => {
    renderStaff(
      <TodayList
        visits={[visit('a', VisitStatus.STARTED, '2026-10-05T10:40:00+06:30', [HAIRCUT])]}
        onOpen={() => {}}
        onStart={() => {}}
      />,
      { locale: 'my' },
    );
    expect(screen.getByText('ဆံပင်ညှပ်')).toBeTruthy();
    expect(screen.getByText('ကြိုမမှာဘဲ လာသူ')).toBeTruthy();
  });

  it('nothing open: the empty state, its Start opens the START sheet', () => {
    const onStart = vi.fn();
    renderStaff(<TodayList visits={[]} onOpen={() => {}} onStart={onStart} />);
    expect(screen.getByText('No customer in progress')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('a finished or incomplete visit is not listed', () => {
    renderStaff(
      <TodayList
        visits={[visit('a', VisitStatus.FINISHED, '2026-10-05T09:00:00+06:30', [HAIRCUT])]}
        onOpen={() => {}}
        onStart={() => {}}
      />,
    );
    expect(screen.getByText('No customer in progress')).toBeTruthy();
  });

  it('a failed query: the error state with Retry', () => {
    const onRetry = vi.fn();
    renderStaff(
      <TodayList
        visits={undefined}
        error={{ code: 'internal_error', request_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70' }}
        onRetry={onRetry}
        onOpen={() => {}}
        onStart={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('while loading: no empty state', () => {
    renderStaff(<TodayList visits={undefined} onOpen={() => {}} onStart={() => {}} />);
    expect(screen.queryByText('No customer in progress')).toBeNull();
  });
});
