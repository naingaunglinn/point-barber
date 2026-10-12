'use client';

import { cn } from 'cn';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../primitives/tooltip';
import { Button } from '../Button/Button';
import type { NavLinkItem } from '../BottomNav/BottomNav';

// The frame of every staff screen (AD-LAY-01 · AD-LAY-02 · AD-LAY-03 · AD-VIS-10 · AD-VIS-11 · AD-VIS-07 ·
// design D10), switched by CSS at Tailwind's `md` (768 px) and `lg` (1024 px), so the server renders the
// right layout for every width:
// - below 768 px: a top app bar (title, branch chip, bell) and the bottom navigation; 16 px gutter;
// - 768–1023 px: the icon rail (64 px, icon + visible label + tooltip); the screens of the active module
//   become tabs at the top of the content (AD-LAY-02);
// - from 1024 px: the rail, the collapsible sub-navigation panel (240 px) and the top bar in the order
//   branch switcher · title · search · bell · language · user menu; 24 px content padding.
// Each slot is rendered once. The top bar and the bottom navigation are sticky, not fixed.

export interface ShellScreen {
  readonly key: string;
  /** Translated. */
  readonly label: string;
  readonly href: string;
}

export interface ShellModule extends NavLinkItem {
  /** The screens of the module, for the sub-navigation. */
  readonly items?: readonly ShellScreen[];
}

export interface AppShellProps {
  /** The modules the user can see (AD-NAV-02), Home first and Settings last. */
  readonly nav: readonly ShellModule[];
  readonly activeKey?: string;
  readonly activeItemKey?: string;
  readonly children: ReactNode;
  /** A `<BottomNav>` (below 768 px). */
  readonly bottomNav?: ReactNode;
  readonly branchSwitcher?: ReactNode;
  /** The page title in the top bar (plain text — the page's `h1` is its PageHeader). */
  readonly title?: ReactNode;
  readonly breadcrumb?: ReactNode;
  readonly search?: ReactNode;
  readonly bell?: ReactNode;
  readonly language?: ReactNode;
  readonly userMenu?: ReactNode;
}

const RAIL_ITEM =
  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-center text-xs leading-tight break-words [&_svg]:size-5';
const SCREEN_LINK = 'flex min-h-11 items-center rounded-md px-3 text-sm break-words';

function activeClass(active: boolean) {
  return active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted';
}

export function AppShell(props: AppShellProps) {
  const { nav, activeKey, activeItemKey, children, bottomNav, branchSwitcher } = props;
  const { title, breadcrumb, search, bell, language, userMenu } = props;
  const [collapsed, setCollapsed] = useState(false);
  const headingId = useId();
  const listId = useId();
  const module = nav.find((item) => item.key === activeKey);
  const screens = module?.items ?? [];

  const screenLinks = (className: string) =>
    screens.map((screen) => {
      const active = screen.key === activeItemKey;
      return (
        <li key={screen.key}>
          <Link
            href={screen.href}
            aria-current={active ? 'page' : undefined}
            className={cn(SCREEN_LINK, className, activeClass(active))}
          >
            {screen.label}
          </Link>
        </li>
      );
    });

  return (
    <TooltipProvider>
      <div data-slot="app-shell" className="flex min-h-dvh bg-background text-foreground">
        <nav
          data-slot="rail"
          className="sticky top-0 hidden w-16 shrink-0 flex-col gap-1 self-start border-e border-border p-1 md:flex"
        >
          <ul className="flex flex-col gap-1">
            {nav.map((item) => {
              const active = item.key === activeKey;
              return (
                <li key={item.key}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(RAIL_ITEM, activeClass(active))}
                      >
                        <span aria-hidden>{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </nav>
        {module === undefined || screens.length === 0 ? null : (
          <nav
            data-slot="sub-nav"
            aria-labelledby={headingId}
            data-collapsed={collapsed || undefined}
            className={cn(
              'sticky top-0 hidden shrink-0 flex-col gap-1 self-start border-e border-border p-2 lg:flex',
              collapsed ? 'w-14' : 'w-60',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id={headingId}
                className={cn('px-2 font-semibold break-words', collapsed && 'sr-only')}
              >
                {module.label}
              </h2>
              <Button
                variant="ghost"
                iconOnly
                icon={collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                aria-labelledby={headingId}
                aria-expanded={!collapsed}
                aria-controls={listId}
                onClick={() => setCollapsed((value) => !value)}
              />
            </div>
            <ul id={listId} hidden={collapsed} className="flex flex-col gap-1">
              {screenLinks('')}
            </ul>
          </nav>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            data-slot="top-bar"
            className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2 md:px-6"
          >
            {branchSwitcher === undefined ? null : (
              <div data-slot="top-branch" className="order-2 md:order-none">
                {branchSwitcher}
              </div>
            )}
            <div data-slot="top-title" className="order-1 min-w-0 flex-1 md:order-none">
              {breadcrumb === undefined ? null : (
                <div className="hidden text-xs text-muted-foreground md:block">{breadcrumb}</div>
              )}
              {title === undefined ? null : <p className="font-semibold break-words">{title}</p>}
            </div>
            {search === undefined ? null : (
              <div data-slot="top-search" className="hidden md:block">
                {search}
              </div>
            )}
            {bell === undefined ? null : (
              <div data-slot="top-bell" className="order-3 md:order-none">
                {bell}
              </div>
            )}
            {language === undefined ? null : (
              <div data-slot="top-language" className="hidden md:block">
                {language}
              </div>
            )}
            {userMenu === undefined ? null : (
              <div data-slot="top-user" className="hidden md:block">
                {userMenu}
              </div>
            )}
          </header>
          {screens.length === 0 ? null : (
            <nav
              data-slot="sub-tabs"
              aria-label={module?.label}
              className="hidden overflow-x-auto border-b border-border px-6 py-1 md:block lg:hidden"
            >
              <ul className="flex gap-1">{screenLinks('whitespace-nowrap')}</ul>
            </nav>
          )}
          <main data-slot="content" className="min-w-0 flex-1 px-4 py-4 md:p-6">
            {children}
          </main>
          {bottomNav === undefined ? null : (
            <div data-slot="bottom-nav-area" className="sticky bottom-0 z-30 md:hidden">
              {bottomNav}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
