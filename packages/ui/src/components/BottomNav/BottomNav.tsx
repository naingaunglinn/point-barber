'use client';

import { cn } from 'cn';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { unreadBadge } from '../NotificationBell/NotificationBell';

// The phone navigation (AD-NAV-01 · AD-LAY-03 · AD-VIS-11 · design D10): at most 5 items, each an icon
// (24 px) with a visible label that wraps rather than clips; the centre item is the user's most frequent
// create action, filled with `--primary` and larger; without a create action there is no centre (4
// items). Badges count unfinished work. The caller chooses the set by permissions (AD-NAV-01).

export interface NavLinkItem {
  readonly key: string;
  /** Translated. */
  readonly label: string;
  /** A lucide icon element (`<CalendarDays />`). */
  readonly icon: ReactNode;
  readonly href: string;
  readonly badge?: number;
}

export interface BottomNavCentre {
  /** Translated ("＋ Start"). */
  readonly label: string;
  readonly icon: ReactNode;
  readonly onPress: () => void;
}

type UpTo4<T> = readonly [T] | readonly [T, T] | readonly [T, T, T] | readonly [T, T, T, T];
type UpTo5<T> = UpTo4<T> | readonly [T, T, T, T, T];

/** At most 5 items in all (AD-NAV-01): 4 around a centre action, or 5 without one. */
export type BottomNavProps = { readonly activeKey?: string } & (
  | { readonly items: UpTo4<NavLinkItem>; readonly centre: BottomNavCentre }
  | { readonly items: UpTo5<NavLinkItem>; readonly centre?: undefined }
);

const ITEM_CLASS =
  'relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-start gap-1 px-1 py-1.5 text-center text-xs leading-tight break-words';

export function BottomNav({ items, centre, activeKey }: BottomNavProps) {
  const link = (item: NavLinkItem) => {
    const active = item.key === activeKey;
    const badge = item.badge === undefined ? null : unreadBadge(item.badge);
    return (
      <li key={item.key} className="flex min-w-0 flex-1">
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          className={cn(
            ITEM_CLASS,
            '[&_svg]:size-6',
            active ? 'font-semibold text-primary' : 'text-muted-foreground',
          )}
        >
          <span className="relative" aria-hidden>
            {item.icon}
          </span>
          <span>{item.label}</span>
          {badge === null ? null : (
            <span
              data-slot="nav-badge"
              className="absolute start-1/2 top-0.5 ms-2 min-w-5 rounded-full bg-destructive px-1 text-center text-xs font-semibold text-destructive-foreground"
            >
              {badge}
            </span>
          )}
        </Link>
      </li>
    );
  };
  const middle = Math.floor(items.length / 2);
  return (
    <nav
      data-slot="bottom-nav"
      className="sticky bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch">
        {items.slice(0, centre === undefined ? items.length : middle).map(link)}
        {centre === undefined ? null : (
          <li className="flex min-w-0 flex-1 justify-center">
            <button
              type="button"
              data-slot="nav-centre"
              onClick={centre.onPress}
              className={cn(ITEM_CLASS, 'font-semibold text-foreground')}
            >
              <span
                aria-hidden
                className="-mt-4 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md [&_svg]:size-6"
              >
                {centre.icon}
              </span>
              <span>{centre.label}</span>
            </button>
          </li>
        )}
        {centre === undefined ? null : items.slice(middle).map(link)}
      </ul>
    </nav>
  );
}
