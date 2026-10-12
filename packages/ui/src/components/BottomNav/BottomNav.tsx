'use client';

import { cn } from 'cn';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CountBadge } from '../CountBadge/CountBadge';

// The phone navigation (AD-NAV-01 · AD-LAY-03 · AD-VIS-11 v1.8 · design D10): at most 5 icon-only items
// (24 px icons, no visible label — owner 12/Oct/2026); each label is screen-reader text inside the item,
// so the name is "Today 3" with its badge. The centre item is the user's most frequent create action,
// filled with `--primary` and larger; without a create action there is no centre (4 items). Badges count
// unfinished work. The caller chooses the set by permissions (AD-NAV-01). It does not position itself:
// AppShell keeps it at the bottom of the screen.

export interface NavLinkItem {
  readonly key: string;
  /** Translated; the item's accessible name. */
  readonly label: string;
  /** A lucide icon element (`<CalendarDays />`). */
  readonly icon: ReactNode;
  readonly href: string;
  readonly badge?: number;
}

export interface BottomNavCentre {
  /** Translated ("＋ Start"); the button's accessible name. */
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

/** An icon with its count badge; the label is read, not shown (AD-VIS-11 v1.8). */
export function NavIcon({
  icon,
  label,
  badge,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly badge?: number;
}) {
  return (
    <>
      <span className="sr-only">{label}</span>{' '}
      <span className="relative">
        <span aria-hidden>{icon}</span>
        {badge === undefined ? null : <CountBadge count={badge} />}
      </span>
    </>
  );
}

const ITEM_CLASS = 'flex min-h-14 min-w-0 flex-1 items-center justify-center';

export function BottomNav({ items, centre, activeKey }: BottomNavProps) {
  const link = (item: NavLinkItem) => {
    const active = item.key === activeKey;
    return (
      <li key={item.key} className="flex min-w-0 flex-1">
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          className={cn(
            ITEM_CLASS,
            '[&_svg]:size-6',
            active ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <NavIcon icon={item.icon} label={item.label} badge={item.badge} />
        </Link>
      </li>
    );
  };
  const middle = Math.floor(items.length / 2);
  return (
    <nav
      data-slot="bottom-nav"
      className="border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch gap-2">
        {items.slice(0, centre === undefined ? items.length : middle).map(link)}
        {centre === undefined ? null : (
          <li className="flex min-w-0 flex-1 justify-center">
            <button
              type="button"
              data-slot="nav-centre"
              onClick={centre.onPress}
              className={ITEM_CLASS}
            >
              <span className="sr-only">{centre.label}</span>
              <span
                aria-hidden
                className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md [&_svg]:size-6"
              >
                {centre.icon}
              </span>
            </button>
          </li>
        )}
        {centre === undefined ? null : items.slice(middle).map(link)}
      </ul>
    </nav>
  );
}
