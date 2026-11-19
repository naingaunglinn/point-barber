'use client';

import {
  Banknote,
  Bell,
  CalendarDays,
  Package,
  ShieldAlert,
  Trash2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import {
  businessDateOf,
  formatRelativeTime,
  NotificationCategory,
  todayMmt,
  type NotificationItem,
} from '@point/shared';

import { Popover, PopoverContent, PopoverTrigger } from '../../primitives/popover';
import { useNow } from '../../providers/clock';
import { useFormat } from '../../providers/format';
import { Button } from '../Button/Button';
import { CountBadge, countText } from '../CountBadge/CountBadge';
import { DataText } from '../DataText/DataText';

// The bell (AD-NTF-01 · D-NTF-01 · D-NTF-02 · AD-FMT-09 · design D10): the unread count capped at 99+ and
// no badge at 0; a panel grouped into Today / Earlier by Myanmar date, each item with its category icon,
// its text, a relative time from the supplied clock and its link (`href`); "Mark all read" and a delete per item.
// It works from properties only — the feature change that wires notifications does the requests.

export interface NotificationBellProps {
  readonly unreadCount: number;
  readonly items: readonly NotificationItem[];
  readonly onOpenItem: (id: string) => void;
  readonly onMarkAllRead: () => void;
  readonly onDelete: (id: string) => void;
}

/** The category icons of D-NTF-03 (design choice: AD-NTF-01 names no icon). */
const CATEGORY_ICON: Readonly<Record<NotificationCategory, LucideIcon>> = {
  [NotificationCategory.BOOKING]: CalendarDays,
  [NotificationCategory.STAFF]: Users,
  [NotificationCategory.MONEY]: Banknote,
  [NotificationCategory.STOCK]: Package,
  [NotificationCategory.PAYROLL]: Wallet,
  [NotificationCategory.SECURITY]: ShieldAlert,
};

/** `99+` above 99; nothing at 0 (the shared count badge). */
export const unreadBadge = countText;

/** A 44 px target even for a one-line item in the English UI (AD-A11Y-05). */
const ITEM_CLASS = 'flex min-h-11 min-w-0 flex-1 flex-col justify-center text-start';

/**
 * The item's link (`href`, for a new tab); a plain click only reports the press — the caller navigates.
 * An item without a link is a button.
 */
function ItemLink({
  item,
  onOpen,
  children,
}: {
  readonly item: NotificationItem;
  readonly onOpen: () => void;
  readonly children: ReactNode;
}) {
  return item.href === null ? (
    <button type="button" className={ITEM_CLASS} onClick={onOpen}>
      {children}
    </button>
  ) : (
    <a
      href={item.href}
      className={ITEM_CLASS}
      onClick={(event) => {
        // A plain click is the app's navigation (the caller routes in onOpenItem, keeping the query
        // cache); Ctrl / ⌘ / Shift / middle click keep the browser's own new-tab behaviour.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        onOpen();
      }}
    >
      {children}
    </a>
  );
}

export function NotificationBell({
  unreadCount,
  items,
  onOpenItem,
  onMarkAllRead,
  onDelete,
}: NotificationBellProps) {
  const t = useTranslations('common');
  const { locale } = useFormat('NotificationBell');
  const now = useNow();
  const today = todayMmt(now);
  const [open, setOpen] = useState(false);
  const groups = [
    {
      key: 'today',
      label: t('notifications.today'),
      items: items.filter((i) => businessDateOf(i.created_at) === today),
    },
    {
      key: 'earlier',
      label: t('notifications.earlier'),
      items: items.filter((i) => businessDateOf(i.created_at) !== today),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-12 items-center justify-center rounded-md hover:bg-muted md:size-10"
        >
          {/* The name is "Notifications" followed by the count, so the count is read too. */}
          <span className="sr-only">{t('notifications.title')}</span>{' '}
          <span className="relative">
            <Bell aria-hidden className="size-5" />
            <CountBadge count={unreadCount} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-w-[100vw] p-0"
        aria-label={t('notifications.title')}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="font-semibold">{t('notifications.title')}</p>
          {items.length === 0 ? null : (
            <Button variant="ghost" onClick={onMarkAllRead}>
              {t('action.markAllRead')}
            </Button>
          )}
        </div>
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t('notifications.empty')}
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label} data-group={group.key}>
                <h3 className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground">
                  {group.label}
                </h3>
                <ul>
                  {group.items.map((item) => {
                    const Icon = CATEGORY_ICON[item.category];
                    return (
                      <li
                        key={item.id}
                        className="flex items-start gap-2 px-3 py-2"
                        data-read={item.read}
                      >
                        <Icon
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        />
                        <ItemLink
                          item={item}
                          onOpen={() => {
                            setOpen(false);
                            onOpenItem(item.id);
                          }}
                        >
                          <span className={item.read ? 'text-sm' : 'text-sm font-semibold'}>
                            <DataText>{item.text}</DataText>
                          </span>
                          <span className="text-xs text-muted-foreground" data-slot="relative-time">
                            {formatRelativeTime(item.created_at, now, { locale })}
                          </span>
                        </ItemLink>
                        <Button
                          variant="ghost"
                          iconOnly
                          icon={<Trash2 />}
                          aria-label={t('action.delete')}
                          onClick={() => onDelete(item.id)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
