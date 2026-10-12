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

// The accessible names: each item's screen-reader label.
const labels = () =>
  [...document.querySelectorAll('[data-slot="bottom-nav"] li')].map(
    (li) => li.querySelector('.sr-only')?.textContent,
  );

describe('BottomNav', () => {
  it('Scenario: Bottom navigation of a barber — icon items named Today, Bookings, Start (filled centre), Customers, More', () => {
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

  it('marks the active item and shows its badge, read with its name', () => {
    render(<BottomNav items={[TODAY, BOOKINGS, CUSTOMERS, MORE]} activeKey="today" />);
    const today = screen.getByRole('link', { name: 'Today 3' });
    expect(today.getAttribute('aria-current')).toBe('page');
    expect(within(today).getByText('3').getAttribute('data-slot')).toBe('count-badge');
    expect(screen.getByRole('link', { name: 'Bookings' }).getAttribute('aria-current')).toBeNull();
  });

  it('Scenario: No create action — 4 items and no centre button', () => {
    render(<BottomNav items={[TODAY, BOOKINGS, CUSTOMERS, MORE]} />);
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows no visible label: each label is screen-reader text (AD-VIS-11 v1.8)', () => {
    render(
      <BottomNav
        items={[TODAY, BOOKINGS, CUSTOMERS, MORE]}
        centre={{ label: START, icon: <Plus />, onPress: vi.fn() }}
      />,
    );
    for (const item of [...screen.getAllByRole('link'), screen.getByRole('button')]) {
      const visibleText = [...item.querySelectorAll('span:not(.sr-only)')]
        .filter((span) => !span.closest('[data-slot="count-badge"]') && span.children.length === 0)
        .map((span) => span.textContent)
        .join('');
      expect(visibleText).toBe('');
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
