import { fireEvent, render, screen, within } from '@testing-library/react';
import { CalendarDays, Ellipsis, House, Plus, Users } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { BottomNav, type NavLinkItem } from './BottomNav';

// ui-foundation "The bottom navigation has at most five labelled items" (AD-NAV-01 · AD-LAY-03 ·
// AD-VIS-11 · design D10). Labels are the caller's (translated).
const item = (key: string, label: string, icon = <House />, badge?: number): NavLinkItem => ({
  key,
  label,
  icon,
  href: `/${key}`,
  badge,
});
const TODAY = item('today', 'Today', <House />, 3);
const BOOKINGS = item('bookings', 'Bookings', <CalendarDays />);
const CUSTOMERS = item('customers', 'Customers', <Users />);
const MORE = item('more', 'More', <Ellipsis />);
const START = 'Start';

const labels = () =>
  [...document.querySelectorAll('[data-slot="bottom-nav"] li')].map((li) =>
    (li.querySelector('a, button') as HTMLElement).textContent?.replace(/\d+$/, ''),
  );

describe('BottomNav', () => {
  it('Scenario: Bottom navigation of a barber — Today, Bookings, Start (filled centre), Customers, More', () => {
    const onPress = vi.fn();
    render(
      <BottomNav
        items={[TODAY, BOOKINGS, CUSTOMERS, MORE]}
        centre={{ label: START, icon: <Plus />, onPress }}
        activeKey="today"
      />,
    );
    expect(labels()).toEqual(['Today', 'Bookings', START, 'Customers', 'More']);
    const centre = screen.getByRole('button', { name: START });
    expect(centre.querySelector('.bg-primary')).not.toBeNull();
    fireEvent.click(centre);
    expect(onPress).toHaveBeenCalledTimes(1);
    for (const link of screen.getAllByRole('link'))
      expect(link.querySelector('svg')).not.toBeNull();
  });

  it('marks the active item and shows its badge', () => {
    render(<BottomNav items={[TODAY, BOOKINGS, CUSTOMERS, MORE]} activeKey="today" />);
    const today = screen.getByRole('link', { name: /Today/ });
    expect(today.getAttribute('aria-current')).toBe('page');
    expect(within(today).getByText('3').getAttribute('data-slot')).toBe('nav-badge');
    expect(screen.getByRole('link', { name: 'Bookings' }).getAttribute('aria-current')).toBeNull();
  });

  it('Scenario: No create action — 4 items and no centre button', () => {
    render(<BottomNav items={[TODAY, BOOKINGS, CUSTOMERS, MORE]} />);
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('labels wrap instead of being cut', () => {
    render(<BottomNav items={[TODAY, BOOKINGS, CUSTOMERS, MORE]} />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toContain('break-words');
      expect(link.className).not.toMatch(/truncate|overflow-hidden|line-clamp/);
    }
  });

  it('Scenario: A sixth item does not compile — 5 items compile', () => {
    const typeOnly = () => (
      <>
        <BottomNav items={[TODAY, BOOKINGS, CUSTOMERS, MORE, item('x', 'X')]} />
        {/* @ts-expect-error — six items (AD-NAV-01) */}
        <BottomNav items={[TODAY, BOOKINGS, CUSTOMERS, MORE, item('x', 'X'), item('y', 'Y')]} />
        {/* @ts-expect-error — five items and a centre are six */}
        <BottomNav
          items={[TODAY, BOOKINGS, CUSTOMERS, MORE, item('x', 'X')]}
          centre={{ label: START, icon: <Plus />, onPress: () => undefined }}
        />
      </>
    );
    expect(typeof typeOnly).toBe('function');
  });
});
