import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationCategory, type NotificationItem } from '@point/shared';

import { ClockProvider } from '../../providers/clock';
import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { NotificationBell, unreadBadge, type NotificationBellProps } from './NotificationBell';

// ui-foundation "NotificationBell renders the unread count and the list from typed data"
// (AD-NTF-01 · D-NTF-01 · D-NTF-02 · AD-FMT-09 · design D10).
const NOW = '2026-10-05T10:42:00+06:30';
const ITEMS: readonly NotificationItem[] = [
  {
    id: 'n1',
    category: NotificationCategory.BOOKING,
    text: 'New booking — Ko Aung, 11:30 AM',
    created_at: '2026-10-05T10:37:00+06:30',
    read: false,
    href: '/bookings/b1',
  },
  {
    id: 'n2',
    category: NotificationCategory.MONEY,
    text: 'Discount request — Ko Min',
    created_at: '2026-10-05T08:42:00+06:30',
    read: false,
    href: null,
  },
  {
    id: 'n3',
    category: NotificationCategory.STOCK,
    text: 'Low stock — Pomade',
    created_at: '2026-10-04T09:01:00+06:30',
    read: true,
    href: '/stock',
  },
];

function renderBell(props: Partial<NotificationBellProps> = {}) {
  const handlers = { onOpenItem: vi.fn(), onMarkAllRead: vi.fn(), onDelete: vi.fn() };
  renderIntl(
    <ClockProvider now={NOW}>
      <FormatProvider locale="en" profile="app">
        <NotificationBell unreadCount={2} items={ITEMS} {...handlers} {...props} />
      </FormatProvider>
    </ClockProvider>,
  );
  return handlers;
}

const open = () => fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));

describe('NotificationBell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Scenario: Badge boundaries — 0 no badge, 99, 100 → 99+', () => {
    expect([0, 99, 100].map(unreadBadge)).toEqual([null, '99', '99+']);
    renderBell({ unreadCount: 0 });
    expect(document.querySelector('[data-slot="count-badge"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeDefined();
  });

  it('shows the capped badge on the bell, and the count is part of its name', () => {
    renderBell({ unreadCount: 100 });
    expect(document.querySelector('[data-slot="count-badge"]')?.textContent).toBe('99+');
    expect(screen.getByRole('button', { name: 'Notifications 99+' })).toBeDefined();
  });

  it('Scenario: Grouping and relative time — Today: 5 min ago, 2 h ago; Earlier: 04/Oct/2026', () => {
    renderBell();
    open();
    const today = screen.getByRole('region', { name: 'Today' });
    const earlier = screen.getByRole('region', { name: 'Earlier' });
    const times = (group: HTMLElement) =>
      [...group.querySelectorAll('[data-slot="relative-time"]')].map((el) => el.textContent);
    expect(times(today)).toEqual(['5 min ago', '2 h ago']);
    expect(times(earlier)).toEqual(['04/Oct/2026']);
    expect(within(today).getByText('New booking — Ko Aung, 11:30 AM')).toBeDefined();
    expect(within(earlier).getByText('Low stock — Pomade')).toBeDefined();
  });

  it('each item has its category icon and its link', () => {
    renderBell();
    open();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    for (const item of items) expect(item.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('link', { name: /New booking/ }).getAttribute('href')).toBe(
      '/bookings/b1',
    );
  });

  it('Scenario: Mark all read — the handler is called once and no request leaves the page', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { onMarkAllRead } = renderBell();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('opening and deleting report the item id', () => {
    const { onOpenItem, onDelete } = renderBell();
    open();
    fireEvent.click(screen.getByRole('button', { name: /Discount request/ }));
    expect(onOpenItem).toHaveBeenCalledWith('n2');
    open();
    const third = screen.getAllByRole('listitem')[2] as HTMLElement;
    fireEvent.click(within(third).getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('n3');
  });

  it('an empty list says so', () => {
    renderBell({ items: [], unreadCount: 0 });
    open();
    expect(screen.getByText('No notifications')).toBeDefined();
  });
});
