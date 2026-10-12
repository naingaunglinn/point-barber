'use client';

import {
  Banknote,
  CalendarDays,
  ChevronDown,
  Ellipsis,
  House,
  Scissors,
  Search,
  Settings,
  ShoppingBag,
  UserCog,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { formatDate, localized, todayMmt } from '@point/shared';

import { AppShell, type ShellModule } from '../../components/AppShell/AppShell';
import { BottomNav, type NavLinkItem } from '../../components/BottomNav/BottomNav';
import { ALL_BRANCHES, BranchSwitcher } from '../../components/BranchSwitcher/BranchSwitcher';
import { EmployeeChip } from '../../components/EmployeeChip/EmployeeChip';
import { LanguageSwitch } from '../../components/LanguageSwitch/LanguageSwitch';
import { NotificationBell } from '../../components/NotificationBell/NotificationBell';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Drawer/Drawer';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { SearchInput } from '../../components/SearchInput/SearchInput';
import type { Action } from '../../components/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu';
import { useNow } from '../../providers/clock';
import { useFormat } from '../../providers/format';
import { useCataloguePersona } from '../catalogue-providers';
import { HandlerLog } from '../demo-frame';
import { useFixtureCan, useFixtureMe } from '../fixture-grants';
import { PEOPLE } from '../fixtures';
import { useCatalogueParam } from './frame-controls';
import { useFixtureNotifications } from './notification-demos';

// Shell demos (task 9.9 · AD-LAY-01..05 · AD-NAV-01 · AD-NAV-02 · AD-NAV-04 · design D12). The modules
// of the rail follow can() over the fixture codes (AD-NAV-02); the bottom navigation is the barber-like
// set of AD-NAV-01, whose centre "＋ Start" needs no permission code — starting one's own visit is open
// to any staff member with a branch in scope (P4.VIS.03) — so it follows `branches_in_scope`. Links stay
// on this page.

const HERE = '#shell';

/** Who is signed in, for the user menu only (the persona is the catalogue's user id). */
const SIGNED_IN = {
  admin: PEOPLE.kyawZin,
  manager: PEOPLE.hnin,
  barber: PEOPLE.aung,
  'branch-holder': null,
} as const;

function useBottomItems(): readonly [NavLinkItem, NavLinkItem, NavLinkItem, NavLinkItem] {
  const t = useTranslations('devui.shell');
  return [
    { key: 'today', label: t('today'), icon: <House />, href: HERE, badge: 1 },
    { key: 'bookings', label: t('bookings'), icon: <CalendarDays />, href: HERE },
    { key: 'customers', label: t('customers'), icon: <Users />, href: HERE },
    { key: 'more', label: t('more'), icon: <Ellipsis />, href: HERE },
  ];
}

function useModules(): ShellModule[] {
  const t = useTranslations('devui.shell');
  const can = useFixtureCan();
  const modules: readonly (ShellModule & { readonly visible: boolean })[] = [
    { key: 'home', label: t('home'), icon: <House />, href: HERE, visible: true },
    {
      key: 'calendar',
      label: t('calendar'),
      icon: <CalendarDays />,
      href: HERE,
      visible: can('booking.create') || can('booking.delete'),
    },
    {
      key: 'sales',
      label: t('sales'),
      icon: <ShoppingBag />,
      href: HERE,
      // Today / POS and Receipts need no code (AD-NAV-02 · P4.RCP.03).
      visible: true,
      items: [
        { key: 'today', label: t('today'), href: HERE },
        { key: 'receipts', label: t('receipts'), href: HERE },
      ],
    },
    {
      key: 'customers',
      label: t('customers'),
      icon: <Users />,
      href: HERE,
      visible: can('customer.update'),
    },
    { key: 'team', label: t('team'), icon: <UserCog />, href: HERE, visible: can('role.update') },
    {
      key: 'money',
      label: t('money'),
      icon: <Banknote />,
      href: HERE,
      visible: can('closing.reopen') || can('payroll.view'),
    },
    {
      key: 'settings',
      label: t('settings'),
      icon: <Settings />,
      href: HERE,
      visible: can('service.update'),
    },
  ];
  return modules.filter((module) => module.visible);
}

function useBranchChoice() {
  const me = useFixtureMe();
  const allowAll = me.grants.some((grant) => grant.scope_type === 1);
  const first = me.branches_in_scope[0]?.id ?? ALL_BRANCHES;
  const [branch, setBranch] = useState(allowAll ? ALL_BRANCHES : first);
  return { me, allowAll, branch, setBranch };
}

export function ShellDemo() {
  const t = useTranslations('devui.shell');
  const common = useTranslations('common');
  const log = useTranslations('devui.log');
  const { locale } = useFormat('AppShell demo');
  const persona = useCataloguePersona();
  const setParam = useCatalogueParam();
  const now = useNow();
  const { me, allowAll, branch, setBranch } = useBranchChoice();
  const [pressed, setPressed] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const notifications = useFixtureNotifications();
  const items = useBottomItems();
  const person = SIGNED_IN[persona];
  const current = me.branches_in_scope.find((item) => item.id === branch);
  const scope = current === undefined ? common('branch.all') : localized(current, 'name', locale);
  const start =
    me.branches_in_scope.length === 0
      ? undefined
      : { label: t('start'), icon: <Scissors />, onPress: () => setPressed(log('start')) };

  return (
    // A phone-sized frame: the shell fills it and its bars stick inside it.
    <div className="h-[40rem] overflow-y-auto border-t border-border" data-slot="shell-frame">
      <AppShell
        height="parent"
        nav={useModules()}
        activeKey="sales"
        activeItemKey="today"
        title={t('today')}
        breadcrumb={t('breadcrumb', { group: t('sales'), screen: t('today') })}
        branchSwitcher={
          <BranchSwitcher
            branches={me.branches_in_scope}
            value={branch}
            userId={persona}
            allowAll={allowAll}
            onChange={setBranch}
          />
        }
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            onSearch={(text) => setPressed(log('searched', { text }))}
            placeholder={common('search.placeholder')}
            className="w-64"
          />
        }
        mobileSearch={
          <Button
            variant="ghost"
            iconOnly
            icon={<Search />}
            aria-label={common('action.search')}
            onClick={() => setSearching(true)}
          />
        }
        bell={
          <NotificationBell
            unreadCount={notifications.filter((item) => !item.read).length}
            items={notifications}
            onOpenItem={() => undefined}
            onMarkAllRead={() => undefined}
            onDelete={() => undefined}
          />
        }
        language={<LanguageSwitch value={locale} onChange={(next) => setParam('lang', next)} />}
        userMenu={
          person === null ? undefined : (
            // The own name opens the own profile (owner 12/Oct/2026); the page itself belongs to
            // add-foundation-auth-access.
            <div className="flex items-center gap-2">
              <EmployeeChip
                name={localized(person, 'name', locale)}
                onOpenProfile={() =>
                  setPressed(log('profile', { name: localized(person, 'name', locale) }))
                }
              />
              {/* ▾ opens the user menu (AD-NAV-07 v1.8 — owner 12/Oct/2026). */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    iconOnly
                    icon={<ChevronDown />}
                    aria-label={common('action.more')}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
                  {/* A menu holds at least one item (axe aria-required-children): the note stands in,
                      disabled, until the entries arrive. */}
                  <DropdownMenuItem disabled className="min-h-11 text-sm whitespace-normal">
                    {t('userMenuNote')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }
        bottomNav={
          start === undefined ? (
            <BottomNav items={items} activeKey="today" />
          ) : (
            <BottomNav items={items} centre={start} activeKey="today" />
          )
        }
      >
        <PageHeader
          title={t('today')}
          subtitle={t('subtitle', { branch: scope, date: formatDate(todayMmt(now), { locale }) })}
        />
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t('content')}</p>
          <HandlerLog label={log('label')} value={pressed} />
        </div>
        {/* Below 768 px the search icon opens the full-screen search (AD-NAV-05). */}
        <Sheet
          open={searching}
          onOpenChange={setSearching}
          title={common('action.search')}
          focusFirstField
        >
          <SearchInput
            value={query}
            onChange={setQuery}
            onSearch={(text) => {
              setPressed(log('searched', { text }));
              setSearching(false);
            }}
            placeholder={common('search.placeholder')}
          />
        </Sheet>
      </AppShell>
    </div>
  );
}

export function BottomNavCentreDemo() {
  const t = useTranslations('devui.shell');
  const log = useTranslations('devui.log');
  const [pressed, setPressed] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <BottomNav
        items={useBottomItems()}
        centre={{ label: t('start'), icon: <Scissors />, onPress: () => setPressed(log('start')) }}
        activeKey="today"
      />
      <HandlerLog label={log('label')} value={pressed} />
    </div>
  );
}

export function BottomNavPlainDemo() {
  return <BottomNav items={useBottomItems()} activeKey="today" />;
}

export function BranchSwitcherDemo() {
  const log = useTranslations('devui.log');
  const persona = useCataloguePersona();
  const { me, allowAll, branch, setBranch } = useBranchChoice();
  const [reported, setReported] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <div>
        <BranchSwitcher
          branches={me.branches_in_scope}
          value={branch}
          userId={persona}
          allowAll={allowAll}
          onChange={(choice) => {
            setBranch(choice);
            setReported(log('branch', { choice }));
          }}
        />
      </div>
      <HandlerLog label={log('label')} value={reported} />
    </div>
  );
}

function usePageActions() {
  const t = useTranslations('devui.shell');
  const log = useTranslations('devui.log');
  const [pressed, setPressed] = useState('');
  const action = (key: 'newBooking' | 'export' | 'print' | 'importFile' | 'settings'): Action => ({
    label: t(key),
    onPress: () => setPressed(log('pressed', { label: t(key) })),
  });
  return { action, pressed, log };
}

function PageHeaderDemo({ four }: { readonly four: boolean }) {
  const t = useTranslations('devui.shell');
  const { action, pressed, log } = usePageActions();
  const secondary = four
    ? [action('export'), action('print'), action('importFile'), action('settings')]
    : [action('export'), action('print')];
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={t('bookings')}
        subtitle={t('subtitle', { branch: t('pointThree'), date: t('demoDate') })}
        primary={action('newBooking')}
        secondary={secondary}
      />
      <HandlerLog label={log('label')} value={pressed} />
    </div>
  );
}

export const PageHeaderFourDemo = () => <PageHeaderDemo four />;
export const PageHeaderTwoDemo = () => <PageHeaderDemo four={false} />;
